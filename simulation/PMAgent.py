from dotenv import load_dotenv
import os
from typing import Annotated, Optional
from typing_extensions import TypedDict
from langchain_openai import ChatOpenAI
from langgraph.graph import StateGraph, START, END
from influxdb_client import InfluxDBClient
from langchain.agents import Tool
from langgraph.graph.message import add_messages
from langchain_core.messages import AIMessage, HumanMessage
from langgraph.checkpoint.memory import MemorySaver
from langchain_core.runnables import RunnableConfig
import argparse
import json
import redis
from datetime import datetime, timezone
import time
import re

def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--process_id", type=str, required=True)
    return parser.parse_args()

args = parse_args()
p_id = args.process_id

load_dotenv()

url = os.getenv("INFLUXDB_URL")
token = os.getenv("INFLUXDB_TOKEN")
org = os.getenv("INFLUXDB_ORG")
redis_url = os.getenv("REDIS_URL")
client = InfluxDBClient(url=url, token=token, org=org)
query_api = client.query_api()

class State(TypedDict):
    messages: Annotated[list, add_messages]
    db_outputs: list
    process_id: list  # 공정 ID를 저장하기 위한 필드 추가
    next_inspection: list
    
graph_builder = StateGraph(State)
llm = ChatOpenAI(model="gpt-4o", temperature=0)

from langchain_core.prompts import ChatPromptTemplate

TEMPLATE = """You are the process operations manager for a factory.
You want to refer to the process equipment status data in InfluxDB to decide whether or not to perform maintenance before a failure occurs.
Based on the user's question, determine which process should be checked.
The process name is one of P1-A, P1-B, P2-A, or P2-B. The answer must be one of these four only.

Below is the ID of the process for which inspection was requested.
User: {question}
process_id:"""

def PredictiveMaster(state: State):
    user_message = ""
    for msg in state["messages"]:
        if isinstance(msg, dict) and msg.get("role") == "user":
            user_message = msg.get("content", "")
            break
    
    # 간단하게 정규식을 사용하여 공정 ID를 직접 찾기
    process_pattern = re.compile(r'P[12]-[AB]', re.IGNORECASE)
    matches = process_pattern.findall(user_message)
    
    if matches:
        # 문자열 매칭에서 찾은 첫 번째 유효한 공정 ID 사용
        process_id = matches[0].upper()  # 대문자로 통일
    else:
        # 사용자 메시지에서 ID가 발견되지 않으면, 기본값 사용
        process_id = p_id  # 기본값
    
    print(f"식별된 공정 ID: {process_id}")
    
    return {
        "messages": [AIMessage(content=f"공정 {process_id}에 대한 상태를 확인하겠습니다.")],
        "process_id": [process_id]
    }

graph_builder.add_node("PredictiveMaster", PredictiveMaster)

class InfluxNode:
    """
    공정 상태를 가져오는 노드
    """
    def __init__(self):
        self.query_api = query_api
        
    def __call__(self, state: State):
        process_id = state.get("process_id", [])[-1]
        print("#########################")
        print(process_id)
        print("#########################")
        if not process_id:
            return {"db_outputs": ["공정 ID를 찾을 수 없습니다."]}
            
        output = []
        
        print(f"다음 공정 상태 조회: {process_id}")
        query = f"""
        from(bucket: "{process_id}_status")
        |> range(start: -1h)
        |> filter(fn: (r) => r["_measurement"] == "status_log")
        |> sort(columns: ["_time"], desc: true)
        """
        
        try:
            result = self.query_api.query(query=query)
            
            for table in result:
                for record in table.records:
                    output.append(f"{record.get_time()}: {record.get_value()}")
            
            if not output:
                output.append("No data found")
                
            db_output = "\n".join(output)
            
        except Exception as e:
            print(f"Error querying InfluxDB: {e}")
            db_output = "Error querying database"
        
        return {"db_outputs": [db_output]}

influx_node = InfluxNode()
graph_builder.add_node("InfluxNode", influx_node)

# 의사결정 템플릿 수정
DECISION_TEMPLATE = """You are the process operations manager for a factory.
You want to refer to the process equipment status data in InfluxDB to decide whether or not to perform maintenance before a failure occurs.

Based on the influxdb results, calculate the mean time to failure frequency and mean time to repair, and decide whether to inspect based on this.
Our goal is to inspect the equipment before a failure to minimize damage.
Please answer only in the json format below.
Please answer whether to inspect with True or False, and also tell us the time when you will decide whether to inspect again.

INFLUX_DB_OUTPUTS: {db_output}

Please respond in this format:
{{"decision": true/false, "next_inspection": "time"}}
"""

def route_to_maintenance(state: State):
    """조회된 결과를 바탕으로 점검이 필요할 경우 'request_maintenance' 노드로 라우팅 되는 엣지"""
    if "db_outputs" not in state or not state["db_outputs"]:
        print("Warning: No db_outputs found in state")
        return "final_answer"
        
    db_output = state["db_outputs"][-1]
    
    print("####### 점검 여부 판단 #######")
    
    # 템플릿의 중괄호를 이스케이프하여 포맷팅 오류 방지
    formatted_prompt = DECISION_TEMPLATE.format(db_output=db_output)
    
    response = llm.invoke([HumanMessage(content=formatted_prompt)])
    response_text = response.content.strip()
    
    print(f"결정 응답: {response_text}")
    
    # JSON 응답 처리
    try:
        # JSON 파싱 전 문자열 정리
        clean_text = response_text
        if clean_text.startswith('```json'):
            clean_text = clean_text.split('```json')[1]
        if clean_text.endswith('```'):
            clean_text = clean_text.split('```')[0]
        clean_text = clean_text.strip()
            
        decision_data = json.loads(clean_text)
        decision = decision_data.get("decision", False)
        
        if isinstance(decision, str):
            decision = decision.lower() == "true"
    except (json.JSONDecodeError, AttributeError) as e:
        print(f"Error parsing decision: {e}")
        print(f"Raw response: {response_text}")
        decision = False
        
    if decision:
        return "request_maintenance"
    else:
        return "final_answer"

graph_builder.add_conditional_edges(
    "InfluxNode",
    route_to_maintenance,
    {"request_maintenance": "request_maintenance",
     "final_answer": "final_answer"}
)

def request_maintenance(state: State):
    process_id = state.get("process_id", [])[-1]
    redis_client = redis.from_url(
            url=redis_url,
            decode_responses=True
        )
    channel = f"{process_id}_maintenance"
    message = "maintenance_request"
    try:
        redis_client.publish(channel, message)
        print(f"Redis publish: {channel} -> {message}")
    except redis.exceptions.ConnectionError as e:
        print(f"Redis connection error: {e}")
        return {"messages": [AIMessage(content="Redis 연결 오류 발생")]}
    return {"messages": [AIMessage(content=f"공정 {process_id}에 대한 점검 요청을 전송했습니다.")]}

graph_builder.add_node("request_maintenance", request_maintenance)

def final_answer(state: State):
    process_id = state.get("process_id", "Unknown")
    db_outputs = state.get("db_outputs", ["No data"])
    
    summary_prompt = f"""당신은 공정 예지보전을 위한 AI 에이전트입니다. 당신의 목표는 설비의 상태를 모니터링하고 고장이 발생하기 전에 점검을 수행하는 것 입니다.
    {process_id} 공정에 대해 이전 설비 상태 로그를 조회하고 평균 고장 간격과 평균 수리 시간을 고려해서 다음 점검 시간을 결정해주세요.
    이전의 효과적이었던 점검 주기를 고려하여 점검 주기를 설정해주세요.
    공정 {process_id}에 대한 상태 정보가 다음과 같습니다:
    
    {db_outputs[-1]}
    
    이 데이터를 기반으로 다음에 공정을 점검 여부를 결정할 시간을 알려주세요.
    그리고 그렇게 결정한 이유에 대해서도 설명하세요.

    답변은 아래 형식으로 해주세요:
    - 시간은 UTC+00:00 기준으로 작성해주세요.
    - 형식은 ISO 8601 datetime 포맷으로 작성해주세요.
    - 응답은 아래와 같은 JSON 형식을 따라주세요:

    {{"next_inspection": "time",
    "reason": "reason"}}
    """
    
    response = llm.invoke([HumanMessage(content=summary_prompt)])
    
    return {"next_inspection": [response.content]}

graph_builder.add_node("final_answer", final_answer)

graph_builder.add_edge(START, "PredictiveMaster")
graph_builder.add_edge("PredictiveMaster", "InfluxNode")
graph_builder.add_edge("request_maintenance", "final_answer")
graph_builder.add_edge("final_answer", END)

memory = MemorySaver()

graph = graph_builder.compile()

def stream_graph_updates(user_input: str):
    config = RunnableConfig(
    recursion_limit=10,  # 최대 10개의 노드까지 방문. 그 이상은 RecursionError 발생
    configurable={"thread_id": "1"},  # 스레드 ID 설정
    )
    for event in graph.stream({"messages": [{"role": "user", "content": user_input}]},config=config):
        for key, value in event.items():
            print(f"{key}: {value}\n")
    return event

def run():
    while True:
        a = stream_graph_updates("P2-A")
        raw_str = a['final_answer']['next_inspection'][0]
        
        # JSON 문자열 추출
        json_str = re.search(r'{.*}', raw_str, re.DOTALL).group()

        # JSON 파싱
        parsed = json.loads(json_str)

        # next_inspection 시간 추출 및 datetime 객체로 변환
        next_inspection_time = datetime.fromisoformat(parsed["next_inspection"])

        # 현재 시간 (UTC 기준)
        now = datetime.now(timezone.utc)

        # 시간 차이 계산
        remaining_time = next_inspection_time - now
        remaining_time_seconds = remaining_time.total_seconds()
        print(remaining_time_seconds)
        if remaining_time_seconds < 0:
            print("점검 시간이 지났습니다.")
            run()
        else:
            time.sleep(remaining_time_seconds)
            run()

if __name__ == "__main__":
    run()