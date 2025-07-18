-- 워크스페이스 권한 시스템 UUID 마이그레이션
-- 기존 String 기반 사용자/그룹 식별자를 UUID 기반으로 변환
-- 실행 전 반드시 데이터베이스 백업 필요!

-- 1. 백업 테이블 생성
CREATE TABLE workspace_users_backup AS SELECT * FROM workspace_users;
CREATE TABLE workspace_groups_backup AS SELECT * FROM workspace_groups;

-- 2. WorkspaceUser 테이블 마이그레이션
-- 2-1. 새로운 컬럼 추가
ALTER TABLE workspace_users 
    ADD COLUMN user_id_new UUID,
    ADD COLUMN user_email VARCHAR(255),
    ADD COLUMN user_info_updated_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 2-2. 사용자 UUID 매핑 함수 (예시 - 실제 매핑 로직 필요)
-- 이 부분은 실제 외부 인증 시스템의 사용자 데이터와 매핑해야 함
CREATE OR REPLACE FUNCTION map_user_string_to_uuid(user_string TEXT) 
RETURNS UUID AS $$
DECLARE
    result_uuid UUID;
BEGIN
    -- 예시: email을 통한 UUID 매핑
    -- 실제로는 외부 인증 시스템 API를 통해 매핑해야 함
    
    -- 임시 방법: email을 기반으로 deterministic UUID 생성
    SELECT MD5(user_string || 'salt')::UUID INTO result_uuid;
    
    RETURN result_uuid;
END;
$$ LANGUAGE plpgsql;

-- 2-3. 기존 데이터 변환
UPDATE workspace_users 
SET 
    user_id_new = map_user_string_to_uuid(user_id),
    user_email = CASE 
        WHEN user_id LIKE '%@%' THEN user_id 
        ELSE NULL 
    END,
    user_info_updated_at = NOW();

-- 2-4. NOT NULL 제약조건 확인 (실패 시 데이터 정리 필요)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM workspace_users WHERE user_id_new IS NULL) THEN
        RAISE EXCEPTION 'User UUID mapping failed. Please check user data and mapping logic.';
    END IF;
END $$;

-- 2-5. 기존 컬럼 제거 및 새 컬럼으로 교체
ALTER TABLE workspace_users DROP COLUMN user_id;
ALTER TABLE workspace_users RENAME COLUMN user_id_new TO user_id;
ALTER TABLE workspace_users ALTER COLUMN user_id SET NOT NULL;

-- 3. WorkspaceGroup 테이블 마이그레이션
-- 3-1. 새로운 컬럼 추가
ALTER TABLE workspace_groups 
    ADD COLUMN group_id UUID,
    ADD COLUMN group_info_updated_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 3-2. 그룹 UUID 매핑 함수 (예시 - 실제 매핑 로직 필요)
CREATE OR REPLACE FUNCTION map_group_name_to_uuid(group_name_str TEXT) 
RETURNS UUID AS $$
DECLARE
    result_uuid UUID;
BEGIN
    -- 예시: 그룹명을 통한 UUID 매핑
    -- 실제로는 외부 그룹 시스템 API를 통해 매핑해야 함
    
    -- 임시 방법: group_name을 기반으로 deterministic UUID 생성
    SELECT MD5('group_' || group_name_str || '_uuid_salt')::UUID INTO result_uuid;
    
    RETURN result_uuid;
END;
$$ LANGUAGE plpgsql;

-- 3-3. 기존 데이터 변환
UPDATE workspace_groups 
SET 
    group_id = map_group_name_to_uuid(group_name),
    group_info_updated_at = NOW();

-- 3-4. NOT NULL 제약조건 확인
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM workspace_groups WHERE group_id IS NULL) THEN
        RAISE EXCEPTION 'Group UUID mapping failed. Please check group data and mapping logic.';
    END IF;
END $$;

-- 3-5. 제약조건 설정
ALTER TABLE workspace_groups ALTER COLUMN group_id SET NOT NULL;

-- 4. 인덱스 재생성
-- WorkspaceUser 인덱스
DROP INDEX IF EXISTS idx_workspace_user_user;
CREATE INDEX idx_workspace_user_user ON workspace_users(user_id);
CREATE INDEX idx_workspace_user_email ON workspace_users(user_email);
CREATE INDEX idx_workspace_user_updated ON workspace_users(user_info_updated_at);

-- WorkspaceGroup 인덱스
DROP INDEX IF EXISTS idx_workspace_group_name;
DROP INDEX IF EXISTS idx_workspace_group_unique;
CREATE INDEX idx_workspace_group_id ON workspace_groups(group_id);
CREATE INDEX idx_workspace_group_name ON workspace_groups(group_name);
CREATE INDEX idx_workspace_group_updated ON workspace_groups(group_info_updated_at);
CREATE UNIQUE INDEX idx_workspace_group_unique ON workspace_groups(workspace_id, group_id);

-- 5. 외래 키 제약조건 재생성 (필요시)
-- WorkspaceUser unique constraint
DROP INDEX IF EXISTS idx_workspace_user_unique;
CREATE UNIQUE INDEX idx_workspace_user_unique ON workspace_users(workspace_id, user_id);

-- 6. 마이그레이션 검증
DO $$
DECLARE
    user_count_before INTEGER;
    user_count_after INTEGER;
    group_count_before INTEGER;
    group_count_after INTEGER;
BEGIN
    -- 백업 테이블과 현재 테이블의 레코드 수 비교
    SELECT COUNT(*) INTO user_count_before FROM workspace_users_backup;
    SELECT COUNT(*) INTO user_count_after FROM workspace_users;
    
    SELECT COUNT(*) INTO group_count_before FROM workspace_groups_backup;
    SELECT COUNT(*) INTO group_count_after FROM workspace_groups;
    
    IF user_count_before != user_count_after THEN
        RAISE WARNING 'User record count mismatch: before=%, after=%', user_count_before, user_count_after;
    END IF;
    
    IF group_count_before != group_count_after THEN
        RAISE WARNING 'Group record count mismatch: before=%, after=%', group_count_before, group_count_after;
    END IF;
    
    RAISE NOTICE 'Migration completed. Users: % -> %, Groups: % -> %', 
                 user_count_before, user_count_after, 
                 group_count_before, group_count_after;
END $$;

-- 7. 임시 함수 정리
DROP FUNCTION IF EXISTS map_user_string_to_uuid(TEXT);
DROP FUNCTION IF EXISTS map_group_name_to_uuid(TEXT);

-- 마이그레이션 완료 로그
INSERT INTO public.migration_log (name, applied_at, description) 
VALUES (
    'workspace_uuid_migration', 
    NOW(), 
    'Migrated workspace users and groups from string-based IDs to UUID-based IDs'
) ON CONFLICT DO NOTHING;

COMMIT;

-- 백업 테이블 정리 (확인 후 수동 실행)
-- DROP TABLE workspace_users_backup;
-- DROP TABLE workspace_groups_backup;