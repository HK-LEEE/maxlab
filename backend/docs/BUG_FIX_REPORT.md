# Bug Fix Report - OAuth Token Parameter

## 문제 설명
`GroupMappingService.get_group_uuid_by_name()` 메서드 호출 시 필수 파라미터인 `user_token`이 누락되어 TypeError 발생

## 에러 메시지
```
TypeError: GroupMappingService.get_group_uuid_by_name() missing 1 required positional argument: 'user_token'
```

## 발생 위치
1. `/app/routers/workspaces.py` - `create_workspace_group` 함수
2. `/app/crud/workspace.py` - `create` 함수 (workspace 생성 시)
3. `/run_workspace_uuid_migration.py` - 마이그레이션 스크립트

## 수정 내용

### 1. workspaces.py 라우터 수정
```python
# Before
group_uuid = await group_mapping_service.get_group_uuid_by_name(group_identifier)

# After  
user_token = current_user.get("token")
if not user_token:
    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="User token not available"
    )
group_uuid = await group_mapping_service.get_group_uuid_by_name(group_identifier, user_token)
```

### 2. workspace CRUD 리팩토링
- CRUD 레벨에서 group_mapping_service 직접 호출 제거
- 라우터에서 그룹명을 UUID로 미리 변환하도록 변경
- CRUD는 이미 변환된 UUID만 처리

### 3. 마이그레이션 스크립트 수정
```python
# 환경 변수에서 마이그레이션 토큰 가져오기
migration_token = os.getenv("MIGRATION_TOKEN") or os.getenv("SERVICE_TOKEN")
if not migration_token:
    logger.error("MIGRATION_TOKEN or SERVICE_TOKEN environment variable is required for migration")
    raise ValueError("Migration token not provided")
    
mapped_uuid = await group_mapping_service.get_group_uuid_by_name(current_group_name, migration_token)
```

## 근본 원인
SERVICE_TOKEN을 제거하고 사용자 OAuth 토큰을 사용하도록 변경하면서, 모든 외부 API 호출이 사용자 토큰을 요구하게 되었지만, 일부 함수에서 이를 전달하지 않았음.

## 해결 방법
1. **현재 사용자 정보에서 토큰 추출**: `current_user.get("token")`
2. **토큰 존재 여부 확인**: 토큰이 없으면 500 에러 반환
3. **모든 외부 API 호출에 토큰 전달**: group_mapping_service, user_mapping_service 메서드 호출 시

## 추가 개선 사항
1. **책임 분리**: 라우터에서 비즈니스 로직(UUID 변환) 처리, CRUD는 데이터베이스 작업만 담당
2. **에러 처리**: 토큰이 없는 경우 명확한 에러 메시지 제공
3. **마이그레이션 지원**: 별도의 환경 변수로 마이그레이션 토큰 지원

## 테스트 결과
- ✅ 헬스 체크: 정상
- ✅ 인증되지 않은 접근 차단: 정상 (403 Forbidden)
- 🔄 인증된 접근: OAuth 토큰으로 테스트 필요