# Fallback Authentication Code Audit Report

## 1. decode_jwt_token_locally() Function

### Function Definition
- **File**: `/home/lee/proejct/maxlab/backend/app/core/security.py`
- **Line**: 27-75
- **Function**: `decode_jwt_token_locally(token: str) -> Dict[str, Any]`
- **Purpose**: JWT 토큰을 로컬에서 디코딩 (검증 없이 - fallback 용도)

### Function Calls/References
1. **Line 178**: Called from `verify_token_with_auth_server()` when traditional auth returns 401
2. **Line 182**: Called from `verify_token_with_auth_server()` when traditional auth returns non-200
3. **Line 188**: Called from `verify_token_with_auth_server()` when network error occurs

## 2. Traditional Auth Fallback Logic

### Primary Fallback Logic in verify_token_with_auth_server()
- **File**: `/home/lee/proejct/maxlab/backend/app/core/security.py`
- **Lines**: 155-188

#### Specific Fallback Patterns:
1. **Lines 155-156**: OAuth 인증 실패 시 기존 인증 방식으로 fallback
2. **Lines 158-174**: Traditional auth 엔드포인트 호출 (`/api/auth/me`)
3. **Lines 175-178**: Traditional auth 401 응답 시 local JWT decode fallback
4. **Lines 180-182**: Traditional auth 비정상 응답 시 local JWT decode fallback
5. **Lines 184-188**: 네트워크 오류 시 local JWT decode fallback

### Traditional Auth in get_user_groups_from_auth_server()
- **File**: `/home/lee/proejct/maxlab/backend/app/core/security.py`
- **Lines**: 223-242
- **Pattern**: OAuth 그룹 조회 실패 시 traditional auth endpoint 사용

## 3. Multi-tier Verification System

### Primary Authentication Flow (3-tier system)
1. **Tier 1**: OAuth userinfo endpoint (`/api/oauth/userinfo`)
2. **Tier 2**: Traditional auth endpoint (`/api/auth/me`) 
3. **Tier 3**: Local JWT decode (no verification)

### Error Handling Chain
- **File**: `/home/lee/proejct/maxlab/backend/app/core/security.py`
- **Lines**: 108-188
- **Pattern**: Each tier failure triggers next tier

## 4. Environment-Specific Branching

### No Direct Environment-based Auth Branching Found
- Searched for environment-specific authentication logic
- No conditional authentication based on ENVIRONMENT variable found
- Environment checks exist in other modules but not in authentication flow

## 5. Related Fallback Components

### Token Blacklist Fallback
- **File**: `/home/lee/proejct/maxlab/backend/app/core/security.py`
- **Lines**: 266-280
- **Pattern**: Token blacklist check failure continues with normal verification

### UUID Mapping Fallback (레거시 호환성)
- **File**: `/home/lee/proejct/maxlab/backend/app/core/security.py`
- **Lines**: 524-534
- **Pattern**: UUID 우선, 레거시 ID fallback

## 6. User Mapping Service Fallbacks

### Service Files with Fallback Logic
- **File**: `/home/lee/proejct/maxlab/backend/app/services/user_mapping.py`
- **File**: `/home/lee/proejct/maxlab/backend/app/services/group_mapping.py`
- **Pattern**: External API failure → deterministic UUID generation

## 7. Removal Checklist

### High Priority - Direct Authentication Fallbacks
- [ ] Remove `decode_jwt_token_locally()` function (lines 27-75)
- [ ] Remove traditional auth fallback in `verify_token_with_auth_server()` (lines 155-188)
- [ ] Remove traditional auth fallback in `get_user_groups_from_auth_server()` (lines 223-242)
- [ ] Simplify `verify_token_with_auth_server()` to OAuth-only flow

### Medium Priority - Support System Cleanups
- [ ] Review and simplify UUID mapping fallback logic (lines 524-534)
- [ ] Review token blacklist error handling (lines 266-280)

### Files to Modify
1. `/home/lee/proejct/maxlab/backend/app/core/security.py` (Primary target)
2. `/home/lee/proejct/maxlab/backend/app/services/user_mapping.py` (Review)
3. `/home/lee/proejct/maxlab/backend/app/services/group_mapping.py` (Review)

## 8. Code Dependencies

### Functions that call fallback logic:
- `get_current_user()` → calls `verify_token_with_auth_server()`
- `get_user_groups_from_auth_server()` → has own traditional auth fallback
- `enrich_user_data_with_uuids()` → uses UUID mapping services

### Impact Assessment:
- **Low Risk**: No other modules directly import `decode_jwt_token_locally()`
- **Medium Risk**: Changes to `verify_token_with_auth_server()` affect all authentication
- **High Risk**: Must ensure OAuth-only flow works reliably before removing fallbacks