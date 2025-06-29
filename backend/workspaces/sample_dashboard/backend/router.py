"""
샘플 대시보드 MVP 모듈 라우터
기본적인 대시보드 API 엔드포인트를 제공합니다.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from typing import Dict, Any, List
from datetime import datetime, timedelta
import random

router = APIRouter()


@router.get("/")
async def get_dashboard_info():
    """대시보드 정보 조회"""
    return {
        "module_name": "sample_dashboard",
        "display_name": "샘플 대시보드",
        "version": "1.0.0",
        "description": "기본적인 대시보드 기능을 제공하는 샘플 모듈",
        "status": "active",
        "features": [
            "사용자 통계",
            "실시간 차트",
            "활동 로그",
            "시스템 상태"
        ]
    }


@router.get("/health")
async def health_check():
    """헬스 체크"""
    return {
        "status": "healthy",
        "module": "sample_dashboard",
        "timestamp": datetime.now().isoformat(),
        "uptime": "running"
    }


@router.get("/stats")
async def get_dashboard_stats():
    """대시보드 통계 데이터 조회"""
    # 샘플 데이터 생성
    return {
        "user_stats": {
            "total_users": random.randint(100, 1000),
            "active_users": random.randint(50, 200),
            "new_users_today": random.randint(5, 25),
            "growth_rate": round(random.uniform(5.0, 15.0), 2)
        },
        "system_stats": {
            "cpu_usage": round(random.uniform(10.0, 80.0), 1),
            "memory_usage": round(random.uniform(20.0, 70.0), 1),
            "disk_usage": round(random.uniform(30.0, 60.0), 1),
            "network_io": round(random.uniform(1.0, 10.0), 2)
        },
        "business_metrics": {
            "total_revenue": round(random.uniform(10000, 50000), 2),
            "orders_today": random.randint(10, 100),
            "conversion_rate": round(random.uniform(2.0, 8.0), 2),
            "avg_order_value": round(random.uniform(50, 200), 2)
        },
        "last_updated": datetime.now().isoformat()
    }


@router.get("/chart-data")
async def get_chart_data(
    period: str = "7d",  # 7d, 30d, 90d
    metric: str = "users"  # users, revenue, orders
):
    """차트 데이터 조회"""
    
    # 기간에 따른 데이터 포인트 수 결정
    days = {
        "7d": 7,
        "30d": 30,
        "90d": 90
    }.get(period, 7)
    
    # 샘플 데이터 생성
    data_points = []
    base_date = datetime.now() - timedelta(days=days)
    
    for i in range(days + 1):
        current_date = base_date + timedelta(days=i)
        
        if metric == "users":
            value = random.randint(50, 300)
        elif metric == "revenue":
            value = round(random.uniform(1000, 5000), 2)
        elif metric == "orders":
            value = random.randint(10, 100)
        else:
            value = random.randint(1, 100)
        
        data_points.append({
            "date": current_date.strftime("%Y-%m-%d"),
            "value": value
        })
    
    return {
        "metric": metric,
        "period": period,
        "data": data_points,
        "total": sum(point["value"] for point in data_points),
        "average": round(sum(point["value"] for point in data_points) / len(data_points), 2),
        "generated_at": datetime.now().isoformat()
    }


@router.get("/activities")
async def get_recent_activities(limit: int = 10):
    """최근 활동 로그 조회"""
    
    activity_types = [
        "사용자 로그인",
        "새 주문 생성",
        "데이터 업데이트",
        "시스템 백업",
        "보고서 생성",
        "사용자 등록",
        "결제 처리",
        "파일 업로드"
    ]
    
    activities = []
    for i in range(limit):
        activity_time = datetime.now() - timedelta(
            minutes=random.randint(1, 1440)  # 최근 24시간 내
        )
        
        activities.append({
            "id": i + 1,
            "type": random.choice(activity_types),
            "description": f"시스템에서 {random.choice(activity_types)}이(가) 수행되었습니다.",
            "user": f"user_{random.randint(1, 100)}",
            "timestamp": activity_time.isoformat(),
            "status": random.choice(["success", "warning", "info"])
        })
    
    return {
        "activities": sorted(activities, key=lambda x: x["timestamp"], reverse=True),
        "total": len(activities),
        "last_updated": datetime.now().isoformat()
    }


@router.get("/widgets")
async def get_dashboard_widgets():
    """대시보드 위젯 설정 조회"""
    return {
        "widgets": [
            {
                "id": "user_stats",
                "title": "사용자 통계",
                "type": "stats_card",
                "position": {"x": 0, "y": 0, "width": 6, "height": 4},
                "config": {
                    "primary_metric": "total_users",
                    "secondary_metrics": ["active_users", "new_users_today"]
                }
            },
            {
                "id": "revenue_chart",
                "title": "매출 차트",
                "type": "line_chart",
                "position": {"x": 6, "y": 0, "width": 6, "height": 4},
                "config": {
                    "metric": "revenue",
                    "period": "30d"
                }
            },
            {
                "id": "system_health",
                "title": "시스템 상태",
                "type": "gauge_chart",
                "position": {"x": 0, "y": 4, "width": 4, "height": 3},
                "config": {
                    "metrics": ["cpu_usage", "memory_usage", "disk_usage"]
                }
            },
            {
                "id": "recent_activities",
                "title": "최근 활동",
                "type": "activity_list",
                "position": {"x": 4, "y": 4, "width": 8, "height": 3},
                "config": {
                    "limit": 5,
                    "show_timestamp": True
                }
            }
        ],
        "layout": "grid",
        "auto_refresh": 30000,  # 30초
        "last_modified": datetime.now().isoformat()
    }


@router.post("/widgets/{widget_id}/config")
async def update_widget_config(widget_id: str, config: Dict[str, Any]):
    """위젯 설정 업데이트"""
    # 실제 구현에서는 데이터베이스에 저장
    return {
        "success": True,
        "widget_id": widget_id,
        "updated_config": config,
        "timestamp": datetime.now().isoformat()
    }


@router.get("/export")
async def export_dashboard_data(format: str = "json"):
    """대시보드 데이터 내보내기"""
    
    if format not in ["json", "csv", "excel"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported export format. Use 'json', 'csv', or 'excel'"
        )
    
    # 실제 구현에서는 요청된 형식으로 데이터를 변환
    export_data = {
        "export_info": {
            "format": format,
            "generated_at": datetime.now().isoformat(),
            "module": "sample_dashboard"
        },
        "data": {
            "stats": await get_dashboard_stats(),
            "chart_data": await get_chart_data(),
            "activities": await get_recent_activities(limit=50)
        }
    }
    
    return export_data 