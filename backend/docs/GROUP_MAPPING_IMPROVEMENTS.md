# 그룹 매핑 개선 사항

## 문제 상황
1. 인증 서버의 `/api/groups/name/{group_name}` 엔드포인트가 500 에러 반환
2. 그룹명을 UUID로 변환할 수 없어 워크스페이스 그룹 추가 실패

## 해결 방법

### 1. 폴백 메커니즘 구현
- 그룹명 검색 엔드포인트 실패 시 검색 API 사용
- 검색 API도 실패 시 결정적 UUID 생성

### 2. 에러 처리 개선
```python
# 그룹명 검색 순서:
1. /api/groups/name/{group_name} 시도
2. 실패 시 /api/groups/search?name={group_name} 시도  
3. 모두 실패 시 결정적 UUID 생성 (설정이 활성화된 경우)
```

### 3. 결정적 UUID 생성
- `ENABLE_DETERMINISTIC_UUID_GENERATION = true` 설정 시 활성화
- UUID v5를 사용하여 동일한 그룹명에 대해 항상 같은 UUID 생성
- 네임스페이스: `maxlab_groups`

## 코드 변경 사항

### group_mapping.py
- `_fetch_group_uuid_from_auth_server` 메서드에 폴백 로직 추가
- 검색 API 사용 및 정확한 이름 매칭 구현

### workspaces.py
- 그룹 UUID 변환 실패 시 결정적 UUID 생성
- 그룹 정보 조회 실패를 경고로 처리 (에러 발생 방지)

## 장점
1. **안정성**: 외부 시스템 장애에도 서비스 지속 가능
2. **일관성**: 동일한 그룹명은 항상 동일한 UUID로 매핑
3. **호환성**: 인증 서버 API가 완전히 구현되지 않아도 동작

## 주의사항
1. 결정적 UUID는 실제 인증 서버의 그룹 UUID와 다를 수 있음
2. 나중에 인증 서버가 업데이트되면 UUID 불일치 문제 발생 가능
3. 마이그레이션 시 이러한 차이점을 고려해야 함

## 향후 개선 방향
1. 인증 서버에 `/api/groups/name/{group_name}` 엔드포인트 구현 요청
2. 그룹 UUID 매핑 캐시 시간 조정 고려
3. UUID 매핑 불일치 감지 및 동기화 도구 개발