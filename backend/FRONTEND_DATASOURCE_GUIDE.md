# Process Flow Editor - Data Source Selection Guide

## 문제 설명
현재 Process Flow Editor에서 data source가 항상 'default'로 설정되어 있습니다. 
정의된 data source가 있을 때는 그것을 먼저 선택하도록 수정이 필요합니다.

## 해결 방안

### 1. Data Source 목록 가져오기

```javascript
// API 엔드포인트
GET /api/v1/personal-test/process-flow/data-sources?workspace_id=personaltest

// 응답 예시
[
  {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "workspace_id": "personaltest",
    "source_type": "mssql",
    "connection_string": "",  // 보안상 빈 문자열
    "is_active": true,
    "created_at": "2024-01-01T00:00:00",
    "updated_at": "2024-01-01T00:00:00"
  }
]
```

### 2. 기본값 선택 로직

```javascript
// ProcessFlowEditor 컴포넌트 예시
const ProcessFlowEditor = () => {
  const [dataSources, setDataSources] = useState([]);
  const [selectedDataSource, setSelectedDataSource] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDataSources();
  }, []);

  const loadDataSources = async () => {
    try {
      const response = await fetch('/api/v1/personal-test/process-flow/data-sources?workspace_id=personaltest');
      const sources = await response.json();
      
      setDataSources(sources);
      
      // 기본 선택 로직
      if (sources && sources.length > 0) {
        // 활성화된 data source 우선
        const activeSources = sources.filter(ds => ds.is_active);
        const defaultSource = activeSources[0] || sources[0];
        setSelectedDataSource(defaultSource.id);
      } else {
        // 정의된 data source가 없을 때만 null (백엔드에서 workspace default 사용)
        setSelectedDataSource(null);
      }
    } catch (error) {
      console.error('Failed to load data sources:', error);
      setSelectedDataSource(null);
    } finally {
      setLoading(false);
    }
  };

  // Process Flow 생성 시
  const createProcessFlow = async (flowData) => {
    const payload = {
      workspace_id: workspaceId,
      name: flowName,
      flow_data: flowData,
      data_source_id: selectedDataSource, // null이면 백엔드에서 workspace default 사용
      scope_type: "USER",
      visibility_scope: "PRIVATE"
    };

    await fetch('/api/v1/personal-test/process-flow/flows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  };

  return (
    <div>
      <select 
        value={selectedDataSource || ''} 
        onChange={(e) => setSelectedDataSource(e.target.value || null)}
      >
        <option value="">Workspace Default</option>
        {dataSources.map(ds => (
          <option key={ds.id} value={ds.id}>
            {ds.source_type} - {ds.id}
          </option>
        ))}
      </select>
      {/* 나머지 UI */}
    </div>
  );
};
```

### 3. 새로운 엔드포인트 활용 (선택사항)

기본 data source 정보를 명시적으로 가져오고 싶다면:

```javascript
// 기본 data source 정보 가져오기
GET /api/v1/personal-test/process-flow/default-data-source?workspace_id=personaltest

// 응답 예시 (data source가 있을 때)
{
  "default_data_source_id": "123e4567-e89b-12d3-a456-426614174000",
  "config_name": "mssql_config",
  "source_type": "mssql",
  "use_workspace_default": false
}

// 응답 예시 (data source가 없을 때)
{
  "default_data_source_id": null,
  "use_workspace_default": true,
  "message": "No data sources defined. Using workspace default configuration."
}
```

## 주의사항

1. **null vs 'default'**: 
   - 백엔드는 `data_source_id`가 null일 때 workspace 기본 설정 사용
   - 'default' 문자열을 보내지 말고 null 또는 아예 필드를 생략

2. **권한 확인**: 
   - Data source API는 인증이 필요함
   - 적절한 인증 토큰을 헤더에 포함

3. **에러 처리**: 
   - Data source 로드 실패 시 workspace default 사용
   - 사용자에게 적절한 피드백 제공

## 테스트 시나리오

1. **Data source가 없을 때**:
   - 'Workspace Default' 선택
   - `data_source_id: null`로 전송

2. **Data source가 하나 있을 때**:
   - 자동으로 해당 data source 선택
   - `data_source_id: "실제ID"`로 전송

3. **여러 Data source가 있을 때**:
   - 첫 번째 활성 data source 자동 선택
   - 드롭다운에서 변경 가능

## 백엔드 동작

- `data_source_id`가 null이면: workspace의 기본 PostgreSQL 사용
- `data_source_id`가 유효한 UUID면: 해당 data source 사용
- `data_source_id`가 잘못된 값이면: 에러 반환