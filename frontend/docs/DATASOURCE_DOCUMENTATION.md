# Flow Editor 데이터 소스 시스템 문서

## 1. Default Datasource 동작 방식

### 개요
Flow Editor에서 "Default datasource"는 PostgreSQL로 설정된 특정 기본 DB가 아니라, **등록된 데이터 소스 목록에서 첫 번째 항목**을 자동으로 선택하는 메커니즘입니다.

### 동작 원리

#### 1.1 데이터 소스 선택 로직
```typescript
// useFlowEditor.ts에서의 동작
const selectedDataSourceId = flow?.data_source_id || dataSources[0]?.id;
```

- **우선순위 1**: 저장된 Flow에 `data_source_id`가 있으면 해당 ID 사용
- **우선순위 2**: 저장된 ID가 없으면 `dataSources` 배열의 첫 번째 항목 자동 선택
- **우선순위 3**: 등록된 데이터 소스가 없으면 `undefined`

#### 1.2 데이터 소스 목록 가져오기
```typescript
// useDataSources.ts
const { data: dataSources } = useQuery({
  queryKey: ['dataSources', workspaceId],
  queryFn: () => apiClient.get(`/api/v1/personal-test/process-flow/data-sources?workspace_id=${workspaceId}`)
});
```

- API 호출을 통해 워크스페이스별 데이터 소스 목록 조회
- 등록 순서대로 배열 반환
- 첫 번째 항목이 "Default datasource"가 됨

#### 1.3 Flow 저장 시 데이터 소스 ID 포함
```typescript
// useFlowEditor.ts의 saveFlow 함수
const flowData = {
  name: flowName,
  description: flowDescription,
  nodes: nodes,
  edges: edges,
  data_source_id: selectedDataSourceId, // 선택된 데이터 소스 ID 저장
  viewport: viewport
};
```

### 중요 특징
1. **PostgreSQL 우선 아님**: 특정 DB 타입에 의존하지 않음
2. **등록 순서 기반**: 가장 먼저 등록된 데이터 소스가 기본값
3. **Flow별 독립적**: 각 Flow마다 다른 데이터 소스 설정 가능
4. **자동 복원**: Flow 로드 시 저장된 데이터 소스 자동 선택

### 관련 파일
- `/hooks/useFlowEditor.ts` - 데이터 소스 선택 및 저장 로직
- `/hooks/useDataSources.ts` - 데이터 소스 목록 관리
- `/pages/ProcessFlowEditor.tsx` - UI에서 데이터 소스 선택 표시

---

## 2. Data Source 가져오기/저장 로직

### 2.1 데이터 소스 목록 가져오기

#### API 엔드포인트
```
GET /api/v1/personal-test/process-flow/data-sources?workspace_id={workspaceId}
```

#### 구현 위치
- **파일**: `/hooks/useDataSources.ts`
- **함수**: `useDataSources` 훅

#### 동작 방식
```typescript
export const useDataSources = (workspaceId: string) => {
  return useQuery({
    queryKey: ['dataSources', workspaceId],
    queryFn: async () => {
      const response = await apiClient.get(
        `/api/v1/personal-test/process-flow/data-sources?workspace_id=${workspaceId}`
      );
      return response.data;
    },
    enabled: !!workspaceId,
    staleTime: 1000 * 60 * 5, // 5분간 캐시 유지
  });
};
```

#### 특징
- **React Query 기반**: 자동 캐싱 및 재검증
- **워크스페이스별 격리**: 각 워크스페이스마다 독립적인 데이터 소스 관리
- **실시간 업데이트**: 데이터 소스 변경 시 자동 리프레시

### 2.2 데이터 소스 저장 로직

#### 새 데이터 소스 생성
```typescript
// DataSourceDialog.tsx의 handleSave 함수
const response = await apiClient.post('/api/v1/personal-test/process-flow/data-sources', {
  name: formData.name,
  source_type: formData.sourceType,
  connection_string: formData.connectionString,
  workspace_id: workspaceId,
  custom_queries: formData.customQueries,
  // 추가 설정들...
});
```

#### 기존 데이터 소스 업데이트
```typescript
const response = await apiClient.put(`/api/v1/personal-test/process-flow/data-sources/${editingSource.id}`, {
  // 동일한 데이터 구조
});
```

### 2.3 지원하는 데이터 소스 타입

#### PostgreSQL
```typescript
{
  source_type: 'postgresql',
  connection_string: 'postgresql://user:password@host:port/database',
  // SSL 설정, 커넥션 풀 등 추가 옵션
}
```

#### Microsoft SQL Server
```typescript
{
  source_type: 'sqlserver',
  connection_string: 'mssql://user:password@host:port/database',
  // 인스턴스, 암호화 등 추가 옵션
}
```

#### REST API
```typescript
{
  source_type: 'api',
  base_url: 'https://api.example.com',
  api_key: 'your-api-key',
  headers: { 'Authorization': 'Bearer token' },
  // 인증, 레이트 리미팅 등 추가 옵션
}
```

### 2.4 연결 테스트 기능
```typescript
// 연결 테스트 API 호출
const testConnection = async (dataSourceId: string) => {
  const response = await apiClient.post(
    `/api/v1/personal-test/process-flow/data-sources/${dataSourceId}/test`
  );
  return response.data.success;
};
```

---

## 3. Custom Query를 통한 Equipment Status와 Measurement Data 가져오기

### 3.1 Custom Query 구조

#### 기본 구조
```typescript
custom_queries: {
  equipment_status: {
    query: "SELECT equipment_type, equipment_code, equipment_name, status, last_run_time FROM equipment_table",
    description: "Equipment status and information query"
  },
  measurement_data: {
    query: "SELECT equipment_type, equipment_code, measurement_code, measurement_desc, measurement_value, timestamp FROM measurement_table",
    description: "Real-time measurement data query"
  }
}
```

### 3.2 Equipment Status 쿼리

#### 필수 필드
- `equipment_type` (string, required) - 장비 타입 코드
- `equipment_code` (string, required) - 고유 장비 코드
- `equipment_name` (string, required) - 장비 이름
- `status` (string, required) - 장비 상태 (ACTIVE, PAUSE, STOP)

#### 선택 필드
- `last_run_time` (datetime, optional) - 마지막 운전 시간

#### 예시 쿼리
```sql
SELECT 
  eq.equipment_type,
  eq.equipment_code,
  eq.equipment_name,
  st.status,
  st.last_run_time
FROM equipment_master eq
LEFT JOIN equipment_status st ON eq.equipment_code = st.equipment_code
WHERE eq.active_flag = 'Y'
ORDER BY eq.equipment_type, eq.equipment_code;
```

### 3.3 Measurement Data 쿼리

#### 필수 필드
- `equipment_type` (string, required) - 장비 타입
- `equipment_code` (string, required) - 장비 코드
- `measurement_code` (string, required) - 측정 코드
- `measurement_desc` (string, required) - 측정 설명
- `measurement_value` (float, required) - 측정값
- `timestamp` (datetime, required) - 측정 시간

#### 선택 필드 (스펙 관리용)
- `upper_spec_limit` (float, optional) - 상한 규격
- `lower_spec_limit` (float, optional) - 하한 규격
- `target_value` (float, optional) - 목표값
- `spec_status` (string, optional) - 규격 상태 (IN_SPEC, ABOVE_SPEC, BELOW_SPEC)

#### 예시 쿼리
```sql
SELECT 
  m.equipment_type,
  m.equipment_code,
  m.measurement_code,
  mc.measurement_desc,
  m.measurement_value,
  m.timestamp,
  s.upper_spec_limit,
  s.lower_spec_limit,
  s.target_value,
  CASE 
    WHEN m.measurement_value > s.upper_spec_limit THEN 'ABOVE_SPEC'
    WHEN m.measurement_value < s.lower_spec_limit THEN 'BELOW_SPEC'
    ELSE 'IN_SPEC'
  END as spec_status
FROM measurement_data m
INNER JOIN measurement_master mc ON m.measurement_code = mc.measurement_code
LEFT JOIN measurement_specs s ON m.measurement_code = s.measurement_code
WHERE m.timestamp >= NOW() - INTERVAL '1 hour'
ORDER BY m.timestamp DESC;
```

### 3.4 쿼리 실행 로직

#### API 엔드포인트
```
POST /api/v1/personal-test/process-flow/data-sources/{id}/execute-query
```

#### 요청 파라미터
```typescript
{
  query_type: 'equipment_status' | 'measurement_data',
  custom_query?: string, // 선택적 커스텀 쿼리
  limit?: number, // 결과 행 수 제한
  parameters?: Record<string, any> // 쿼리 파라미터
}
```

#### 응답 형식
```typescript
{
  success: boolean,
  data: Array<Record<string, any>>,
  total_count: number,
  execution_time_ms: number,
  warnings?: string[]
}
```

### 3.5 Field Mapping 시스템

#### 매핑 설정 구조
```typescript
field_mappings: {
  equipment_status: {
    equipment_type: { source_field: 'eq_type', transform: 'UPPER(value)' },
    equipment_code: { source_field: 'eq_code', transform: null },
    equipment_name: { source_field: 'eq_name', transform: null },
    status: { source_field: 'status', transform: null, default_value: 'UNKNOWN' }
  },
  measurement_data: {
    measurement_value: { source_field: 'value', transform: 'CAST(value AS FLOAT)', data_type: 'float' }
    // 기타 필드 매핑...
  }
}
```

#### 지원하는 변환 기능
1. **데이터 타입 변환**: string, int, float, datetime, boolean
2. **SQL 함수 적용**: UPPER(), LOWER(), CAST(), 수식 계산
3. **기본값 설정**: NULL 값에 대한 기본값 지정
4. **조건부 변환**: CASE WHEN 구문 지원

### 3.6 데이터 미리보기 시스템

#### Preview API
```
POST /api/v1/personal-test/process-flow/data-sources/{id}/preview-mapping
```

#### 기능
- **원본 데이터 표시**: 쿼리 실행 결과의 원시 데이터
- **매핑된 데이터 표시**: Field Mapping 적용 후 결과
- **오류 검증**: 필수 필드 누락, 데이터 타입 오류 등 확인
- **샘플 데이터 제한**: 성능을 위해 처음 100행만 미리보기

#### 구현 파일
- `/components/editor/DataPreviewDialog.tsx` - 미리보기 UI
- `/components/editor/FieldMappingDialog.tsx` - 필드 매핑 설정 UI

### 3.7 사용 사례

#### 실시간 모니터링
```typescript
// 1분마다 측정 데이터 자동 갱신
const measurementQuery = `
  SELECT * FROM latest_measurements 
  WHERE timestamp >= NOW() - INTERVAL '5 minutes'
`;
```

#### 장비 상태 대시보드
```typescript
// 전체 장비 현재 상태 조회
const equipmentStatusQuery = `
  SELECT 
    equipment_type,
    equipment_code,
    equipment_name,
    status,
    CASE status 
      WHEN 'ACTIVE' THEN 'text-green-600'
      WHEN 'PAUSE' THEN 'text-yellow-600'
      ELSE 'text-red-600'
    END as status_color
  FROM equipment_status_view
`;
```

### 관련 파일 목록
- `/components/editor/DataSourceDialog.tsx` - 데이터 소스 설정 UI
- `/components/editor/FieldMappingDialog.tsx` - 필드 매핑 설정
- `/components/editor/DataPreviewDialog.tsx` - 데이터 미리보기
- `/hooks/useDataSources.ts` - 데이터 소스 관리 훅
- `/hooks/useFlowEditor.ts` - Flow 편집기 상태 관리

---

## 변경 이력
- 2025-07-16: 초기 문서 작성
- 2025-07-16: Measurement Specs 기능 제거 완료
- 2025-07-16: Data Sources 톱니바퀴 아이콘 제거 완료