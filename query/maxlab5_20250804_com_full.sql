--
-- PostgreSQL database dump
--

-- Dumped from database version 17.5
-- Dumped by pg_dump version 17.5

-- Started on 2025-08-04 13:45:22

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- TOC entry 4 (class 2615 OID 2200)
-- Name: public; Type: SCHEMA; Schema: -; Owner: pg_database_owner
--

CREATE SCHEMA public;


ALTER SCHEMA public OWNER TO pg_database_owner;

--
-- TOC entry 5320 (class 0 OID 0)
-- Dependencies: 4
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: pg_database_owner
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- TOC entry 6 (class 2615 OID 21126)
-- Name: workspace_backup; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA workspace_backup;


ALTER SCHEMA workspace_backup OWNER TO postgres;

--
-- TOC entry 885 (class 1247 OID 19845)
-- Name: ownertype; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.ownertype AS ENUM (
    'USER',
    'GROUP'
);


ALTER TYPE public.ownertype OWNER TO postgres;

--
-- TOC entry 888 (class 1247 OID 19850)
-- Name: workspacetype; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.workspacetype AS ENUM (
    'PERSONAL',
    'GROUP',
    'PUBLIC'
);


ALTER TYPE public.workspacetype OWNER TO postgres;

--
-- TOC entry 254 (class 1255 OID 19855)
-- Name: get_next_version_number(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_next_version_number(p_flow_id uuid) RETURNS integer
    LANGUAGE plpgsql
    AS $$
            BEGIN
                RETURN COALESCE(
                    (SELECT MAX(version_number) + 1 
                     FROM personal_test_process_flow_versions 
                     WHERE flow_id = p_flow_id), 
                    1
                );
            END;
            $$;


ALTER FUNCTION public.get_next_version_number(p_flow_id uuid) OWNER TO postgres;

--
-- TOC entry 255 (class 1255 OID 19856)
-- Name: publish_flow_version(uuid, integer, character varying); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.publish_flow_version(p_flow_id uuid, p_version_number integer, p_token character varying) RETURNS void
    LANGUAGE plpgsql
    AS $$
            BEGIN
                -- Unpublish all versions of this flow
                UPDATE personal_test_process_flow_versions
                SET is_published = FALSE,
                    publish_token = NULL,
                    published_at = NULL
                WHERE flow_id = p_flow_id;
                
                -- Publish the specified version
                UPDATE personal_test_process_flow_versions
                SET is_published = TRUE,
                    publish_token = p_token,
                    published_at = CURRENT_TIMESTAMP
                WHERE flow_id = p_flow_id AND version_number = p_version_number;
                
                -- Update main flow table
                UPDATE personal_test_process_flows
                SET is_published = TRUE,
                    publish_token = p_token,
                    published_at = CURRENT_TIMESTAMP,
                    current_version = p_version_number
                WHERE id = p_flow_id;
            END;
            $$;


ALTER FUNCTION public.publish_flow_version(p_flow_id uuid, p_version_number integer, p_token character varying) OWNER TO postgres;

--
-- TOC entry 256 (class 1255 OID 21622)
-- Name: sync_flow_scope(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.sync_flow_scope() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
            BEGIN
                -- When main flow scope changes, update all versions to match
                IF TG_OP = 'UPDATE' AND (
                    OLD.scope_type != NEW.scope_type OR 
                    OLD.visibility_scope != NEW.visibility_scope OR 
                    OLD.shared_with_workspace != NEW.shared_with_workspace
                ) THEN
                    UPDATE personal_test_process_flow_versions 
                    SET 
                        scope_type = NEW.scope_type,
                        visibility_scope = NEW.visibility_scope,
                        shared_with_workspace = NEW.shared_with_workspace
                    WHERE flow_id = NEW.id;
                END IF;
                
                RETURN NEW;
            END;
            $$;


ALTER FUNCTION public.sync_flow_scope() OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 218 (class 1259 OID 19857)
-- Name: alembic_version; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.alembic_version (
    version_num character varying(32) NOT NULL
);


ALTER TABLE public.alembic_version OWNER TO postgres;

--
-- TOC entry 219 (class 1259 OID 19860)
-- Name: api_endpoint_mappings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.api_endpoint_mappings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    config_id uuid NOT NULL,
    data_type character varying(50) NOT NULL,
    endpoint_path character varying(500) NOT NULL,
    http_method character varying(10) DEFAULT 'GET'::character varying,
    request_template jsonb,
    response_mapping jsonb,
    CONSTRAINT api_endpoint_mappings_data_type_check CHECK (((data_type)::text = ANY (ARRAY[('EQUIPMENT_STATUS'::character varying)::text, ('MEASUREMENT_DATA'::character varying)::text])))
);


ALTER TABLE public.api_endpoint_mappings OWNER TO postgres;

--
-- TOC entry 220 (class 1259 OID 19868)
-- Name: data_source_configs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.data_source_configs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id character varying(255) NOT NULL,
    config_name character varying(255) NOT NULL,
    source_type character varying(50) NOT NULL,
    api_url character varying(500),
    api_key character varying(500),
    api_headers jsonb,
    mssql_connection_string character varying(500),
    is_active boolean DEFAULT true,
    cache_ttl integer DEFAULT 300,
    timeout_seconds integer DEFAULT 30,
    retry_count integer DEFAULT 3,
    created_by character varying(255),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    connection_string character varying(500),
    custom_queries jsonb,
    CONSTRAINT data_source_configs_source_type_check CHECK (((source_type)::text = ANY (ARRAY[('POSTGRESQL'::character varying)::text, ('MSSQL'::character varying)::text, ('API'::character varying)::text])))
);


ALTER TABLE public.data_source_configs OWNER TO postgres;

--
-- TOC entry 5321 (class 0 OID 0)
-- Dependencies: 220
-- Name: COLUMN data_source_configs.custom_queries; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.data_source_configs.custom_queries IS 'Custom SQL queries for each data type. Structure: {"equipment_status": {"query": "SELECT ...", "description": "..."}, ...}';


--
-- TOC entry 221 (class 1259 OID 19881)
-- Name: data_source_endpoint_mappings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.data_source_endpoint_mappings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    data_source_id uuid NOT NULL,
    data_type character varying(50) NOT NULL,
    table_name character varying(255),
    query_template text,
    endpoint_path character varying(500),
    http_method character varying(10) DEFAULT 'GET'::character varying,
    request_headers jsonb,
    request_body_template text,
    response_path character varying(500),
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.data_source_endpoint_mappings OWNER TO postgres;

--
-- TOC entry 222 (class 1259 OID 19891)
-- Name: data_source_field_mappings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.data_source_field_mappings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    data_source_id uuid NOT NULL,
    data_type character varying(50) NOT NULL,
    source_field character varying(255) NOT NULL,
    target_field character varying(255) NOT NULL,
    data_type_conversion character varying(50),
    transform_function text,
    default_value text,
    is_required boolean DEFAULT false,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.data_source_field_mappings OWNER TO postgres;

--
-- TOC entry 223 (class 1259 OID 19901)
-- Name: data_source_mappings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.data_source_mappings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id character varying(255) NOT NULL,
    data_source_id uuid NOT NULL,
    mapping_type character varying(50) NOT NULL,
    source_code character varying(255) NOT NULL,
    source_name character varying(255),
    source_type character varying(100),
    target_code character varying(255) NOT NULL,
    target_name character varying(255),
    target_type character varying(100),
    transform_rules jsonb,
    is_active boolean DEFAULT true,
    created_by character varying(255),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.data_source_mappings OWNER TO postgres;

--
-- TOC entry 224 (class 1259 OID 19910)
-- Name: file_shares; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.file_shares (
    id uuid NOT NULL,
    file_id uuid NOT NULL,
    share_token character varying(255) NOT NULL,
    share_type character varying(50),
    password character varying(255),
    expires_at timestamp with time zone,
    max_downloads integer,
    download_count integer,
    created_by character varying(255) NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    last_accessed_at timestamp with time zone
);


ALTER TABLE public.file_shares OWNER TO postgres;

--
-- TOC entry 5322 (class 0 OID 0)
-- Dependencies: 224
-- Name: COLUMN file_shares.share_token; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.file_shares.share_token IS '공유 토큰';


--
-- TOC entry 5323 (class 0 OID 0)
-- Dependencies: 224
-- Name: COLUMN file_shares.share_type; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.file_shares.share_type IS '공유 타입 (view/download)';


--
-- TOC entry 5324 (class 0 OID 0)
-- Dependencies: 224
-- Name: COLUMN file_shares.password; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.file_shares.password IS '비밀번호 (해시)';


--
-- TOC entry 5325 (class 0 OID 0)
-- Dependencies: 224
-- Name: COLUMN file_shares.expires_at; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.file_shares.expires_at IS '만료일시';


--
-- TOC entry 5326 (class 0 OID 0)
-- Dependencies: 224
-- Name: COLUMN file_shares.max_downloads; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.file_shares.max_downloads IS '최대 다운로드 횟수';


--
-- TOC entry 5327 (class 0 OID 0)
-- Dependencies: 224
-- Name: COLUMN file_shares.download_count; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.file_shares.download_count IS '다운로드 횟수';


--
-- TOC entry 5328 (class 0 OID 0)
-- Dependencies: 224
-- Name: COLUMN file_shares.created_by; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.file_shares.created_by IS '생성자';


--
-- TOC entry 5329 (class 0 OID 0)
-- Dependencies: 224
-- Name: COLUMN file_shares.created_at; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.file_shares.created_at IS '생성일시';


--
-- TOC entry 5330 (class 0 OID 0)
-- Dependencies: 224
-- Name: COLUMN file_shares.last_accessed_at; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.file_shares.last_accessed_at IS '마지막 접근일시';


--
-- TOC entry 225 (class 1259 OID 19916)
-- Name: measurement_specs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.measurement_specs (
    measurement_code character varying(30) NOT NULL,
    usl numeric(20,3),
    lsl numeric(20,3),
    target numeric(20,3),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.measurement_specs OWNER TO postgres;

--
-- TOC entry 252 (class 1259 OID 21528)
-- Name: mvp_module_group_access; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.mvp_module_group_access (
    id uuid NOT NULL,
    module_id uuid NOT NULL,
    group_uuid uuid NOT NULL,
    permission_level character varying(20) NOT NULL,
    granted_by uuid NOT NULL,
    granted_at timestamp with time zone DEFAULT now(),
    is_active boolean NOT NULL,
    revoked_by uuid,
    revoked_at timestamp with time zone,
    notes text
);


ALTER TABLE public.mvp_module_group_access OWNER TO postgres;

--
-- TOC entry 5331 (class 0 OID 0)
-- Dependencies: 252
-- Name: COLUMN mvp_module_group_access.group_uuid; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.mvp_module_group_access.group_uuid IS '그룹 UUID';


--
-- TOC entry 5332 (class 0 OID 0)
-- Dependencies: 252
-- Name: COLUMN mvp_module_group_access.permission_level; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.mvp_module_group_access.permission_level IS '권한 레벨 (view/edit/admin)';


--
-- TOC entry 5333 (class 0 OID 0)
-- Dependencies: 252
-- Name: COLUMN mvp_module_group_access.granted_by; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.mvp_module_group_access.granted_by IS '권한 부여자';


--
-- TOC entry 5334 (class 0 OID 0)
-- Dependencies: 252
-- Name: COLUMN mvp_module_group_access.granted_at; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.mvp_module_group_access.granted_at IS '권한 부여일시';


--
-- TOC entry 5335 (class 0 OID 0)
-- Dependencies: 252
-- Name: COLUMN mvp_module_group_access.is_active; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.mvp_module_group_access.is_active IS '활성 상태';


--
-- TOC entry 5336 (class 0 OID 0)
-- Dependencies: 252
-- Name: COLUMN mvp_module_group_access.revoked_by; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.mvp_module_group_access.revoked_by IS '권한 회수자';


--
-- TOC entry 5337 (class 0 OID 0)
-- Dependencies: 252
-- Name: COLUMN mvp_module_group_access.revoked_at; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.mvp_module_group_access.revoked_at IS '권한 회수일시';


--
-- TOC entry 5338 (class 0 OID 0)
-- Dependencies: 252
-- Name: COLUMN mvp_module_group_access.notes; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.mvp_module_group_access.notes IS '메모';


--
-- TOC entry 226 (class 1259 OID 19921)
-- Name: mvp_module_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.mvp_module_logs (
    id uuid NOT NULL,
    module_id uuid NOT NULL,
    action character varying(100) NOT NULL,
    message text,
    details json,
    created_by character varying(255) NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.mvp_module_logs OWNER TO postgres;

--
-- TOC entry 5339 (class 0 OID 0)
-- Dependencies: 226
-- Name: COLUMN mvp_module_logs.action; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.mvp_module_logs.action IS '액션 타입 (install/uninstall/activate/deactivate/configure)';


--
-- TOC entry 5340 (class 0 OID 0)
-- Dependencies: 226
-- Name: COLUMN mvp_module_logs.message; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.mvp_module_logs.message IS '로그 메시지';


--
-- TOC entry 5341 (class 0 OID 0)
-- Dependencies: 226
-- Name: COLUMN mvp_module_logs.details; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.mvp_module_logs.details IS '상세 정보 JSON';


--
-- TOC entry 5342 (class 0 OID 0)
-- Dependencies: 226
-- Name: COLUMN mvp_module_logs.created_by; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.mvp_module_logs.created_by IS '액션 수행자';


--
-- TOC entry 5343 (class 0 OID 0)
-- Dependencies: 226
-- Name: COLUMN mvp_module_logs.created_at; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.mvp_module_logs.created_at IS '생성일시';


--
-- TOC entry 251 (class 1259 OID 21509)
-- Name: mvp_module_user_access; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.mvp_module_user_access (
    id uuid NOT NULL,
    module_id uuid NOT NULL,
    user_uuid uuid NOT NULL,
    permission_level character varying(20) NOT NULL,
    granted_by uuid NOT NULL,
    granted_at timestamp with time zone DEFAULT now(),
    expires_at timestamp with time zone,
    is_active boolean NOT NULL,
    revoked_by uuid,
    revoked_at timestamp with time zone,
    notes text
);


ALTER TABLE public.mvp_module_user_access OWNER TO postgres;

--
-- TOC entry 5344 (class 0 OID 0)
-- Dependencies: 251
-- Name: COLUMN mvp_module_user_access.user_uuid; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.mvp_module_user_access.user_uuid IS '사용자 UUID';


--
-- TOC entry 5345 (class 0 OID 0)
-- Dependencies: 251
-- Name: COLUMN mvp_module_user_access.permission_level; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.mvp_module_user_access.permission_level IS '권한 레벨 (view/edit/admin)';


--
-- TOC entry 5346 (class 0 OID 0)
-- Dependencies: 251
-- Name: COLUMN mvp_module_user_access.granted_by; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.mvp_module_user_access.granted_by IS '권한 부여자';


--
-- TOC entry 5347 (class 0 OID 0)
-- Dependencies: 251
-- Name: COLUMN mvp_module_user_access.granted_at; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.mvp_module_user_access.granted_at IS '권한 부여일시';


--
-- TOC entry 5348 (class 0 OID 0)
-- Dependencies: 251
-- Name: COLUMN mvp_module_user_access.expires_at; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.mvp_module_user_access.expires_at IS '권한 만료일시';


--
-- TOC entry 5349 (class 0 OID 0)
-- Dependencies: 251
-- Name: COLUMN mvp_module_user_access.is_active; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.mvp_module_user_access.is_active IS '활성 상태';


--
-- TOC entry 5350 (class 0 OID 0)
-- Dependencies: 251
-- Name: COLUMN mvp_module_user_access.revoked_by; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.mvp_module_user_access.revoked_by IS '권한 회수자';


--
-- TOC entry 5351 (class 0 OID 0)
-- Dependencies: 251
-- Name: COLUMN mvp_module_user_access.revoked_at; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.mvp_module_user_access.revoked_at IS '권한 회수일시';


--
-- TOC entry 5352 (class 0 OID 0)
-- Dependencies: 251
-- Name: COLUMN mvp_module_user_access.notes; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.mvp_module_user_access.notes IS '메모';


--
-- TOC entry 227 (class 1259 OID 19927)
-- Name: mvp_modules; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.mvp_modules (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    module_name character varying(255) NOT NULL,
    display_name character varying(255) NOT NULL,
    description text,
    version character varying(50),
    is_active boolean NOT NULL,
    is_installed boolean NOT NULL,
    config json,
    sort_order integer,
    icon character varying(100),
    color character varying(20),
    created_by character varying(255) NOT NULL,
    updated_by character varying(255),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone,
    module_type character varying(50) DEFAULT 'custom'::character varying,
    route_path character varying(255),
    module_path character varying(500),
    template character varying(50) DEFAULT 'default'::character varying,
    permissions json DEFAULT '{}'::json
);


ALTER TABLE public.mvp_modules OWNER TO postgres;

--
-- TOC entry 5353 (class 0 OID 0)
-- Dependencies: 227
-- Name: COLUMN mvp_modules.module_name; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.mvp_modules.module_name IS '모듈명 (파이썬 모듈명)';


--
-- TOC entry 5354 (class 0 OID 0)
-- Dependencies: 227
-- Name: COLUMN mvp_modules.display_name; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.mvp_modules.display_name IS '표시명';


--
-- TOC entry 5355 (class 0 OID 0)
-- Dependencies: 227
-- Name: COLUMN mvp_modules.description; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.mvp_modules.description IS '모듈 설명';


--
-- TOC entry 5356 (class 0 OID 0)
-- Dependencies: 227
-- Name: COLUMN mvp_modules.version; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.mvp_modules.version IS '모듈 버전';


--
-- TOC entry 5357 (class 0 OID 0)
-- Dependencies: 227
-- Name: COLUMN mvp_modules.is_active; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.mvp_modules.is_active IS '활성화 상태';


--
-- TOC entry 5358 (class 0 OID 0)
-- Dependencies: 227
-- Name: COLUMN mvp_modules.is_installed; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.mvp_modules.is_installed IS '설치 상태';


--
-- TOC entry 5359 (class 0 OID 0)
-- Dependencies: 227
-- Name: COLUMN mvp_modules.config; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.mvp_modules.config IS '모듈 설정 JSON';


--
-- TOC entry 5360 (class 0 OID 0)
-- Dependencies: 227
-- Name: COLUMN mvp_modules.sort_order; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.mvp_modules.sort_order IS '정렬 순서';


--
-- TOC entry 5361 (class 0 OID 0)
-- Dependencies: 227
-- Name: COLUMN mvp_modules.icon; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.mvp_modules.icon IS '아이콘';


--
-- TOC entry 5362 (class 0 OID 0)
-- Dependencies: 227
-- Name: COLUMN mvp_modules.color; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.mvp_modules.color IS '테마 색상';


--
-- TOC entry 5363 (class 0 OID 0)
-- Dependencies: 227
-- Name: COLUMN mvp_modules.created_by; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.mvp_modules.created_by IS '생성자';


--
-- TOC entry 5364 (class 0 OID 0)
-- Dependencies: 227
-- Name: COLUMN mvp_modules.updated_by; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.mvp_modules.updated_by IS '최종 수정자';


--
-- TOC entry 5365 (class 0 OID 0)
-- Dependencies: 227
-- Name: COLUMN mvp_modules.created_at; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.mvp_modules.created_at IS '생성일시';


--
-- TOC entry 5366 (class 0 OID 0)
-- Dependencies: 227
-- Name: COLUMN mvp_modules.updated_at; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.mvp_modules.updated_at IS '수정일시';


--
-- TOC entry 228 (class 1259 OID 19936)
-- Name: personal_test_equipment_status; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.personal_test_equipment_status (
    equipment_type character varying(20) NOT NULL,
    equipment_code character varying(30) NOT NULL,
    equipment_name character varying(50) NOT NULL,
    status character varying(20) NOT NULL,
    last_run_time timestamp with time zone,
    CONSTRAINT personal_test_equipment_status_status_check CHECK (((status)::text = ANY (ARRAY[('ACTIVE'::character varying)::text, ('PAUSE'::character varying)::text, ('STOP'::character varying)::text])))
);


ALTER TABLE public.personal_test_equipment_status OWNER TO postgres;

--
-- TOC entry 229 (class 1259 OID 19940)
-- Name: personal_test_measurement_data; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.personal_test_measurement_data (
    id integer NOT NULL,
    equipment_type character varying(20) NOT NULL,
    equipment_code character varying(30) NOT NULL,
    measurement_code character varying(30) NOT NULL,
    measurement_desc character varying(100) NOT NULL,
    measurement_value numeric(20,3) NOT NULL,
    "timestamp" timestamp with time zone DEFAULT now(),
    usl double precision,
    lsl double precision,
    spec_status integer DEFAULT 0
);


ALTER TABLE public.personal_test_measurement_data OWNER TO postgres;

--
-- TOC entry 230 (class 1259 OID 19945)
-- Name: personal_test_measurement_data_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.personal_test_measurement_data_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.personal_test_measurement_data_id_seq OWNER TO postgres;

--
-- TOC entry 5367 (class 0 OID 0)
-- Dependencies: 230
-- Name: personal_test_measurement_data_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.personal_test_measurement_data_id_seq OWNED BY public.personal_test_measurement_data.id;


--
-- TOC entry 231 (class 1259 OID 19946)
-- Name: personal_test_process_flow_versions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.personal_test_process_flow_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    flow_id uuid NOT NULL,
    version_number integer NOT NULL,
    flow_data jsonb NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    created_by character varying(255) NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    is_published boolean DEFAULT false,
    published_at timestamp with time zone,
    publish_token character varying(255),
    data_source_id character varying(255),
    scope_type character varying(20) DEFAULT 'USER'::character varying NOT NULL,
    visibility_scope character varying(50) DEFAULT 'PRIVATE'::character varying NOT NULL,
    shared_with_workspace boolean DEFAULT false NOT NULL,
    CONSTRAINT check_version_scope_type CHECK (((scope_type)::text = ANY ((ARRAY['WORKSPACE'::character varying, 'USER'::character varying])::text[]))),
    CONSTRAINT check_version_visibility_scope CHECK (((visibility_scope)::text = ANY ((ARRAY['WORKSPACE'::character varying, 'PRIVATE'::character varying])::text[])))
);


ALTER TABLE public.personal_test_process_flow_versions OWNER TO postgres;

--
-- TOC entry 232 (class 1259 OID 19954)
-- Name: personal_test_process_flows; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.personal_test_process_flows (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    flow_data jsonb NOT NULL,
    created_by character varying(255),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    is_published boolean DEFAULT false,
    published_at timestamp with time zone,
    publish_token character varying(255),
    current_version integer DEFAULT 1,
    data_source_id character varying(255),
    scope_type character varying(20) DEFAULT 'USER'::character varying NOT NULL,
    visibility_scope character varying(50) DEFAULT 'PRIVATE'::character varying NOT NULL,
    shared_with_workspace boolean DEFAULT false NOT NULL,
    CONSTRAINT check_scope_type CHECK (((scope_type)::text = ANY ((ARRAY['WORKSPACE'::character varying, 'USER'::character varying])::text[]))),
    CONSTRAINT check_visibility_scope CHECK (((visibility_scope)::text = ANY ((ARRAY['WORKSPACE'::character varying, 'PRIVATE'::character varying])::text[])))
);


ALTER TABLE public.personal_test_process_flows OWNER TO postgres;

--
-- TOC entry 233 (class 1259 OID 19964)
-- Name: published_process_flows; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.published_process_flows AS
 SELECT f.id,
    f.name,
    f.workspace_id,
    f.is_published,
    f.published_at,
    f.publish_token,
    COALESCE(v.flow_data, f.flow_data) AS flow_data,
    v.version_number AS published_version,
    v.name AS version_name
   FROM (public.personal_test_process_flows f
     LEFT JOIN public.personal_test_process_flow_versions v ON (((f.id = v.flow_id) AND (v.is_published = true))))
  WHERE (f.is_published = true);


ALTER VIEW public.published_process_flows OWNER TO postgres;

--
-- TOC entry 239 (class 1259 OID 20182)
-- Name: status_mappings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.status_mappings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    source_status character varying(50) NOT NULL,
    target_status character varying(20) NOT NULL,
    data_source_type character varying(20),
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT status_mappings_target_status_check CHECK (((target_status)::text = ANY ((ARRAY['ACTIVE'::character varying, 'PAUSE'::character varying, 'STOP'::character varying])::text[])))
);


ALTER TABLE public.status_mappings OWNER TO postgres;

--
-- TOC entry 244 (class 1259 OID 21358)
-- Name: total_monitoring_database_connections; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.total_monitoring_database_connections (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    groupid uuid NOT NULL,
    connection_name character varying(255) NOT NULL,
    database_type character varying(50) NOT NULL,
    connection_string_encrypted text NOT NULL,
    is_active boolean,
    created_by character varying(255) NOT NULL,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    CONSTRAINT check_database_type CHECK (((database_type)::text = ANY ((ARRAY['POSTGRESQL'::character varying, 'MSSQL'::character varying, 'MYSQL'::character varying, 'ORACLE'::character varying])::text[])))
);


ALTER TABLE public.total_monitoring_database_connections OWNER TO postgres;

--
-- TOC entry 246 (class 1259 OID 21399)
-- Name: total_monitoring_equipment_nodes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.total_monitoring_equipment_nodes (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    groupid uuid NOT NULL,
    flow_id uuid NOT NULL,
    node_id character varying(255) NOT NULL,
    equipment_code character varying(100) NOT NULL,
    equipment_name character varying(255) NOT NULL,
    display_name character varying(255) NOT NULL,
    equipment_status character varying(50),
    node_position_x double precision,
    node_position_y double precision,
    node_width double precision,
    node_height double precision,
    measurement_mappings jsonb,
    data_query text,
    created_by character varying(255) NOT NULL,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    CONSTRAINT check_equipment_status CHECK (((equipment_status)::text = ANY ((ARRAY['ACTIVE'::character varying, 'PAUSE'::character varying, 'STOP'::character varying])::text[])))
);


ALTER TABLE public.total_monitoring_equipment_nodes OWNER TO postgres;

--
-- TOC entry 247 (class 1259 OID 21422)
-- Name: total_monitoring_instrument_nodes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.total_monitoring_instrument_nodes (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    groupid uuid NOT NULL,
    flow_id uuid NOT NULL,
    node_id character varying(255) NOT NULL,
    instrument_name character varying(255) NOT NULL,
    display_name character varying(255) NOT NULL,
    node_position_x double precision,
    node_position_y double precision,
    node_width double precision,
    node_height double precision,
    measurement_mappings jsonb,
    data_query text,
    created_by character varying(255) NOT NULL,
    created_at timestamp with time zone,
    updated_at timestamp with time zone
);


ALTER TABLE public.total_monitoring_instrument_nodes OWNER TO postgres;

--
-- TOC entry 245 (class 1259 OID 21376)
-- Name: total_monitoring_process_flows; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.total_monitoring_process_flows (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    groupid uuid NOT NULL,
    flow_name character varying(255) NOT NULL,
    flow_data jsonb NOT NULL,
    database_connection_id uuid,
    auto_save_data jsonb,
    backup_timestamp timestamp with time zone,
    version_number integer,
    is_published boolean,
    published_at timestamp with time zone,
    publish_token character varying(255),
    created_by character varying(255) NOT NULL,
    created_at timestamp with time zone,
    updated_at timestamp with time zone
);


ALTER TABLE public.total_monitoring_process_flows OWNER TO postgres;

--
-- TOC entry 248 (class 1259 OID 21444)
-- Name: total_monitoring_published_flows; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.total_monitoring_published_flows (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    groupid uuid NOT NULL,
    flow_id uuid NOT NULL,
    publish_token character varying(255) NOT NULL,
    published_name character varying(255) NOT NULL,
    published_data jsonb NOT NULL,
    is_active boolean,
    view_count integer,
    last_viewed_at timestamp with time zone,
    created_by character varying(255) NOT NULL,
    created_at timestamp with time zone,
    expires_at timestamp with time zone
);


ALTER TABLE public.total_monitoring_published_flows OWNER TO postgres;

--
-- TOC entry 249 (class 1259 OID 21469)
-- Name: total_monitoring_query_templates; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.total_monitoring_query_templates (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    groupid uuid NOT NULL,
    template_name character varying(255) NOT NULL,
    template_description text,
    query_template text NOT NULL,
    parameter_schema jsonb,
    result_schema jsonb,
    is_system_template boolean,
    created_by character varying(255) NOT NULL,
    created_at timestamp with time zone,
    updated_at timestamp with time zone
);


ALTER TABLE public.total_monitoring_query_templates OWNER TO postgres;

--
-- TOC entry 250 (class 1259 OID 21486)
-- Name: total_monitoring_workspace_features; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.total_monitoring_workspace_features (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    feature_name character varying(100) NOT NULL,
    feature_slug character varying(100) NOT NULL,
    display_name character varying(255) NOT NULL,
    description text,
    icon character varying(100),
    color character varying(20),
    route_path character varying(255) NOT NULL,
    component_path character varying(500),
    is_implemented boolean,
    is_active boolean,
    sort_order integer,
    permissions jsonb,
    created_by character varying(255) NOT NULL,
    created_at timestamp with time zone,
    updated_at timestamp with time zone
);


ALTER TABLE public.total_monitoring_workspace_features OWNER TO postgres;

--
-- TOC entry 253 (class 1259 OID 21726)
-- Name: user_sessions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_sessions (
    session_id character varying(64) NOT NULL,
    user_id character varying(255) NOT NULL,
    user_email character varying(255),
    created_at timestamp without time zone NOT NULL,
    last_accessed timestamp without time zone NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    is_active boolean NOT NULL,
    ip_address character varying(45),
    user_agent text,
    session_data json,
    jwt_token_id character varying(255),
    is_suspicious boolean NOT NULL,
    login_method character varying(50)
);


ALTER TABLE public.user_sessions OWNER TO postgres;

--
-- TOC entry 234 (class 1259 OID 19969)
-- Name: v_measurement_data_with_spec; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.v_measurement_data_with_spec AS
 SELECT m.id,
    m.equipment_type,
    m.equipment_code,
    m.measurement_code,
    m.measurement_desc,
    m.measurement_value,
    m."timestamp",
    s.usl,
    s.lsl,
    s.target,
        CASE
            WHEN ((s.usl IS NOT NULL) AND (m.measurement_value > s.usl)) THEN 'ABOVE_SPEC'::text
            WHEN ((s.lsl IS NOT NULL) AND (m.measurement_value < s.lsl)) THEN 'BELOW_SPEC'::text
            WHEN ((s.usl IS NOT NULL) OR (s.lsl IS NOT NULL)) THEN 'IN_SPEC'::text
            ELSE NULL::text
        END AS spec_status
   FROM (public.personal_test_measurement_data m
     LEFT JOIN public.measurement_specs s ON (((m.measurement_code)::text = (s.measurement_code)::text)));


ALTER VIEW public.v_measurement_data_with_spec OWNER TO postgres;

--
-- TOC entry 235 (class 1259 OID 19974)
-- Name: workspace_files; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.workspace_files (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    parent_id uuid,
    name character varying(255) NOT NULL,
    original_name character varying(255) NOT NULL,
    file_path character varying(1000) NOT NULL,
    file_size bigint NOT NULL,
    mime_type character varying(255) NOT NULL,
    file_hash character varying(64),
    is_directory boolean NOT NULL,
    file_extension character varying(50),
    file_metadata json,
    description text,
    is_deleted boolean NOT NULL,
    is_public boolean NOT NULL,
    version integer,
    version_of uuid,
    uploaded_by character varying(255) NOT NULL,
    uploaded_at timestamp with time zone DEFAULT now(),
    modified_by character varying(255),
    modified_at timestamp with time zone
);


ALTER TABLE public.workspace_files OWNER TO postgres;

--
-- TOC entry 5368 (class 0 OID 0)
-- Dependencies: 235
-- Name: COLUMN workspace_files.name; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_files.name IS '파일명';


--
-- TOC entry 5369 (class 0 OID 0)
-- Dependencies: 235
-- Name: COLUMN workspace_files.original_name; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_files.original_name IS '원본 파일명';


--
-- TOC entry 5370 (class 0 OID 0)
-- Dependencies: 235
-- Name: COLUMN workspace_files.file_path; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_files.file_path IS '저장 경로';


--
-- TOC entry 5371 (class 0 OID 0)
-- Dependencies: 235
-- Name: COLUMN workspace_files.file_size; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_files.file_size IS '파일 크기 (bytes)';


--
-- TOC entry 5372 (class 0 OID 0)
-- Dependencies: 235
-- Name: COLUMN workspace_files.mime_type; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_files.mime_type IS 'MIME 타입';


--
-- TOC entry 5373 (class 0 OID 0)
-- Dependencies: 235
-- Name: COLUMN workspace_files.file_hash; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_files.file_hash IS '파일 해시 (SHA256)';


--
-- TOC entry 5374 (class 0 OID 0)
-- Dependencies: 235
-- Name: COLUMN workspace_files.is_directory; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_files.is_directory IS '디렉토리 여부';


--
-- TOC entry 5375 (class 0 OID 0)
-- Dependencies: 235
-- Name: COLUMN workspace_files.file_extension; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_files.file_extension IS '파일 확장자';


--
-- TOC entry 5376 (class 0 OID 0)
-- Dependencies: 235
-- Name: COLUMN workspace_files.file_metadata; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_files.file_metadata IS '파일 메타데이터';


--
-- TOC entry 5377 (class 0 OID 0)
-- Dependencies: 235
-- Name: COLUMN workspace_files.description; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_files.description IS '파일 설명';


--
-- TOC entry 5378 (class 0 OID 0)
-- Dependencies: 235
-- Name: COLUMN workspace_files.is_deleted; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_files.is_deleted IS '삭제 상태';


--
-- TOC entry 5379 (class 0 OID 0)
-- Dependencies: 235
-- Name: COLUMN workspace_files.is_public; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_files.is_public IS '공개 여부';


--
-- TOC entry 5380 (class 0 OID 0)
-- Dependencies: 235
-- Name: COLUMN workspace_files.version; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_files.version IS '파일 버전';


--
-- TOC entry 5381 (class 0 OID 0)
-- Dependencies: 235
-- Name: COLUMN workspace_files.version_of; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_files.version_of IS '원본 파일 ID';


--
-- TOC entry 5382 (class 0 OID 0)
-- Dependencies: 235
-- Name: COLUMN workspace_files.uploaded_by; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_files.uploaded_by IS '업로드 사용자';


--
-- TOC entry 5383 (class 0 OID 0)
-- Dependencies: 235
-- Name: COLUMN workspace_files.uploaded_at; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_files.uploaded_at IS '업로드 일시';


--
-- TOC entry 5384 (class 0 OID 0)
-- Dependencies: 235
-- Name: COLUMN workspace_files.modified_by; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_files.modified_by IS '최종 수정자';


--
-- TOC entry 5385 (class 0 OID 0)
-- Dependencies: 235
-- Name: COLUMN workspace_files.modified_at; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_files.modified_at IS '수정일시';


--
-- TOC entry 236 (class 1259 OID 19980)
-- Name: workspace_groups; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.workspace_groups (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    group_name character varying(255) NOT NULL,
    group_display_name character varying(255),
    permission_level character varying(50) NOT NULL,
    created_by character varying(255) NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    group_id_uuid uuid,
    group_info_updated_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.workspace_groups OWNER TO postgres;

--
-- TOC entry 5386 (class 0 OID 0)
-- Dependencies: 236
-- Name: COLUMN workspace_groups.group_name; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_groups.group_name IS '그룹명';


--
-- TOC entry 5387 (class 0 OID 0)
-- Dependencies: 236
-- Name: COLUMN workspace_groups.group_display_name; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_groups.group_display_name IS '그룹 표시명';


--
-- TOC entry 5388 (class 0 OID 0)
-- Dependencies: 236
-- Name: COLUMN workspace_groups.permission_level; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_groups.permission_level IS '권한 레벨 (read/write/admin)';


--
-- TOC entry 5389 (class 0 OID 0)
-- Dependencies: 236
-- Name: COLUMN workspace_groups.created_by; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_groups.created_by IS '생성자';


--
-- TOC entry 5390 (class 0 OID 0)
-- Dependencies: 236
-- Name: COLUMN workspace_groups.created_at; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_groups.created_at IS '생성일시';


--
-- TOC entry 237 (class 1259 OID 19986)
-- Name: workspace_users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.workspace_users (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    user_id character varying(255) NOT NULL,
    user_display_name character varying(255),
    permission_level character varying(50) NOT NULL,
    created_by character varying(255) NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    user_id_uuid uuid,
    user_email character varying(255),
    user_info_updated_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.workspace_users OWNER TO postgres;

--
-- TOC entry 5391 (class 0 OID 0)
-- Dependencies: 237
-- Name: COLUMN workspace_users.user_id; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_users.user_id IS '사용자 ID';


--
-- TOC entry 5392 (class 0 OID 0)
-- Dependencies: 237
-- Name: COLUMN workspace_users.user_display_name; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_users.user_display_name IS '사용자 표시명';


--
-- TOC entry 5393 (class 0 OID 0)
-- Dependencies: 237
-- Name: COLUMN workspace_users.permission_level; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_users.permission_level IS '권한 레벨 (read/write/admin)';


--
-- TOC entry 5394 (class 0 OID 0)
-- Dependencies: 237
-- Name: COLUMN workspace_users.created_by; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_users.created_by IS '생성자';


--
-- TOC entry 5395 (class 0 OID 0)
-- Dependencies: 237
-- Name: COLUMN workspace_users.created_at; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_users.created_at IS '생성일시';


--
-- TOC entry 238 (class 1259 OID 19992)
-- Name: workspaces; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.workspaces (
    id uuid NOT NULL,
    name character varying(255) NOT NULL,
    slug character varying(100) NOT NULL,
    description text,
    is_active boolean NOT NULL,
    settings json,
    created_by character varying(255) NOT NULL,
    updated_by character varying(255),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone,
    workspace_type character varying(50) DEFAULT 'PERSONAL'::character varying,
    owner_type character varying(50) DEFAULT 'USER'::character varying,
    owner_id character varying(255),
    parent_id uuid,
    path character varying(1000) DEFAULT '/'::character varying,
    is_folder boolean DEFAULT false
);


ALTER TABLE public.workspaces OWNER TO postgres;

--
-- TOC entry 5396 (class 0 OID 0)
-- Dependencies: 238
-- Name: COLUMN workspaces.name; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspaces.name IS '워크스페이스 이름';


--
-- TOC entry 5397 (class 0 OID 0)
-- Dependencies: 238
-- Name: COLUMN workspaces.slug; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspaces.slug IS 'URL 친화적 이름';


--
-- TOC entry 5398 (class 0 OID 0)
-- Dependencies: 238
-- Name: COLUMN workspaces.description; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspaces.description IS '워크스페이스 설명';


--
-- TOC entry 5399 (class 0 OID 0)
-- Dependencies: 238
-- Name: COLUMN workspaces.is_active; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspaces.is_active IS '활성화 상태';


--
-- TOC entry 5400 (class 0 OID 0)
-- Dependencies: 238
-- Name: COLUMN workspaces.settings; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspaces.settings IS '워크스페이스 설정 JSON';


--
-- TOC entry 5401 (class 0 OID 0)
-- Dependencies: 238
-- Name: COLUMN workspaces.created_by; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspaces.created_by IS '생성자';


--
-- TOC entry 5402 (class 0 OID 0)
-- Dependencies: 238
-- Name: COLUMN workspaces.updated_by; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspaces.updated_by IS '최종 수정자';


--
-- TOC entry 5403 (class 0 OID 0)
-- Dependencies: 238
-- Name: COLUMN workspaces.created_at; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspaces.created_at IS '생성일시';


--
-- TOC entry 5404 (class 0 OID 0)
-- Dependencies: 238
-- Name: COLUMN workspaces.updated_at; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspaces.updated_at IS '수정일시';


--
-- TOC entry 243 (class 1259 OID 21138)
-- Name: migration_metadata; Type: TABLE; Schema: workspace_backup; Owner: postgres
--

CREATE TABLE workspace_backup.migration_metadata (
    id integer NOT NULL,
    backup_date timestamp with time zone DEFAULT now(),
    table_name character varying(255) NOT NULL,
    record_count integer NOT NULL,
    migration_version character varying(50),
    notes text
);


ALTER TABLE workspace_backup.migration_metadata OWNER TO postgres;

--
-- TOC entry 242 (class 1259 OID 21137)
-- Name: migration_metadata_id_seq; Type: SEQUENCE; Schema: workspace_backup; Owner: postgres
--

CREATE SEQUENCE workspace_backup.migration_metadata_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE workspace_backup.migration_metadata_id_seq OWNER TO postgres;

--
-- TOC entry 5405 (class 0 OID 0)
-- Dependencies: 242
-- Name: migration_metadata_id_seq; Type: SEQUENCE OWNED BY; Schema: workspace_backup; Owner: postgres
--

ALTER SEQUENCE workspace_backup.migration_metadata_id_seq OWNED BY workspace_backup.migration_metadata.id;


--
-- TOC entry 241 (class 1259 OID 21132)
-- Name: workspace_groups_backup; Type: TABLE; Schema: workspace_backup; Owner: postgres
--

CREATE TABLE workspace_backup.workspace_groups_backup (
    id uuid,
    workspace_id uuid,
    group_name character varying(255),
    group_display_name character varying(255),
    permission_level character varying(50),
    created_by character varying(255),
    created_at timestamp with time zone,
    group_id_uuid uuid,
    group_info_updated_at timestamp with time zone,
    updated_at timestamp with time zone
);


ALTER TABLE workspace_backup.workspace_groups_backup OWNER TO postgres;

--
-- TOC entry 240 (class 1259 OID 21127)
-- Name: workspace_users_backup; Type: TABLE; Schema: workspace_backup; Owner: postgres
--

CREATE TABLE workspace_backup.workspace_users_backup (
    id uuid,
    workspace_id uuid,
    user_id character varying(255),
    user_display_name character varying(255),
    permission_level character varying(50),
    created_by character varying(255),
    created_at timestamp with time zone,
    user_id_uuid uuid,
    user_email character varying(255),
    user_info_updated_at timestamp with time zone,
    updated_at timestamp with time zone
);


ALTER TABLE workspace_backup.workspace_users_backup OWNER TO postgres;

--
-- TOC entry 4869 (class 2604 OID 20002)
-- Name: personal_test_measurement_data id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.personal_test_measurement_data ALTER COLUMN id SET DEFAULT nextval('public.personal_test_measurement_data_id_seq'::regclass);


--
-- TOC entry 4900 (class 2604 OID 21141)
-- Name: migration_metadata id; Type: DEFAULT; Schema: workspace_backup; Owner: postgres
--

ALTER TABLE ONLY workspace_backup.migration_metadata ALTER COLUMN id SET DEFAULT nextval('workspace_backup.migration_metadata_id_seq'::regclass);


--
-- TOC entry 5281 (class 0 OID 19857)
-- Dependencies: 218
-- Data for Name: alembic_version; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.alembic_version (version_num) VALUES ('mvp_module_access_001');


--
-- TOC entry 5282 (class 0 OID 19860)
-- Dependencies: 219
-- Data for Name: api_endpoint_mappings; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- TOC entry 5283 (class 0 OID 19868)
-- Dependencies: 220
-- Data for Name: data_source_configs; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.data_source_configs (id, workspace_id, config_name, source_type, api_url, api_key, api_headers, mssql_connection_string, is_active, cache_ttl, timeout_seconds, retry_count, created_by, created_at, updated_at, connection_string, custom_queries) VALUES ('2881a01f-1eed-4343-b0d1-5d8d22f6744a', '21ee03db-90c4-4592-b00f-c44801e0b164', 'mssql_config', 'MSSQL', NULL, NULL, NULL, 'DRIVER={FreeTDS};SERVER=172.28.32.1;DATABASE=AIDB;UID=mss;PWD=2300;TrustServerCertificate=yes;Connection Timeout=30;Command Timeout=60;TDS_Version=8.0;Port=1433', true, 300, 30, 3, NULL, '2025-07-08 11:58:08.280747+09', '2025-07-09 08:48:43.611596+09', NULL, '{"equipment_status": {"query": "select * from [dbo].[vw_equipment_status_mock]\n", "description": ""}, "measurement_data": {"query": "select *\nfrom vw_measurement_data_mock\n", "description": ""}}');


--
-- TOC entry 5284 (class 0 OID 19881)
-- Dependencies: 221
-- Data for Name: data_source_endpoint_mappings; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.data_source_endpoint_mappings (id, data_source_id, data_type, table_name, query_template, endpoint_path, http_method, request_headers, request_body_template, response_path, is_active, created_at, updated_at) VALUES ('4ace0782-2223-4895-a438-3c1ff5053fd6', '83c84ef5-c316-40bb-8cf6-8b574320b7e5', 'equipment_status', 'equipment_status', 'SELECT equipment_type, equipment_code, equipment_name, status, last_run_time FROM personal_test_equipment_status WHERE 1=1', NULL, 'GET', NULL, NULL, NULL, true, '2025-07-06 17:55:37.216054', '2025-07-06 17:55:37.216054');


--
-- TOC entry 5285 (class 0 OID 19891)
-- Dependencies: 222
-- Data for Name: data_source_field_mappings; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.data_source_field_mappings (id, data_source_id, data_type, source_field, target_field, data_type_conversion, transform_function, default_value, is_required, is_active, created_at, updated_at) VALUES ('1ba83374-6bc3-406e-b69a-0b5db8aa3ee7', '83c84ef5-c316-40bb-8cf6-8b574320b7e5', 'equipment_status', 'equipment_type', 'equipment_type', 'string', NULL, NULL, true, true, '2025-07-06 17:55:51.236433', '2025-07-06 17:55:51.236433');
INSERT INTO public.data_source_field_mappings (id, data_source_id, data_type, source_field, target_field, data_type_conversion, transform_function, default_value, is_required, is_active, created_at, updated_at) VALUES ('1bd0050b-d081-4705-bad3-04cb3abbe321', '83c84ef5-c316-40bb-8cf6-8b574320b7e5', 'equipment_status', 'equipment_code', 'equipment_code', 'string', NULL, NULL, true, true, '2025-07-06 17:55:51.270672', '2025-07-06 17:55:51.270672');
INSERT INTO public.data_source_field_mappings (id, data_source_id, data_type, source_field, target_field, data_type_conversion, transform_function, default_value, is_required, is_active, created_at, updated_at) VALUES ('98a49821-75a9-4fd1-aa3a-36019179b3df', '83c84ef5-c316-40bb-8cf6-8b574320b7e5', 'equipment_status', 'equipment_name', 'equipment_name', 'string', NULL, NULL, true, true, '2025-07-06 17:55:51.296489', '2025-07-06 17:55:51.296489');
INSERT INTO public.data_source_field_mappings (id, data_source_id, data_type, source_field, target_field, data_type_conversion, transform_function, default_value, is_required, is_active, created_at, updated_at) VALUES ('3aed989d-5ae2-4a26-9c3f-c8a65f2e0872', '83c84ef5-c316-40bb-8cf6-8b574320b7e5', 'equipment_status', 'status', 'status', 'string', NULL, NULL, true, true, '2025-07-06 17:55:51.31941', '2025-07-06 17:55:51.31941');
INSERT INTO public.data_source_field_mappings (id, data_source_id, data_type, source_field, target_field, data_type_conversion, transform_function, default_value, is_required, is_active, created_at, updated_at) VALUES ('c497e5bf-3968-4bd9-a015-ed68bf670ee1', '83c84ef5-c316-40bb-8cf6-8b574320b7e5', 'equipment_status', 'last_run_time', 'last_run_time', 'datetime', NULL, NULL, false, true, '2025-07-06 17:55:51.343095', '2025-07-06 17:55:51.343095');
INSERT INTO public.data_source_field_mappings (id, data_source_id, data_type, source_field, target_field, data_type_conversion, transform_function, default_value, is_required, is_active, created_at, updated_at) VALUES ('e8fce743-7eb8-49c1-8156-ba891b288425', '83c84ef5-c316-40bb-8cf6-8b574320b7e5', 'measurement_data', 'equipment_type', 'equipment_type', 'string', NULL, NULL, true, true, '2025-07-06 17:55:59.654762', '2025-07-06 17:55:59.654762');
INSERT INTO public.data_source_field_mappings (id, data_source_id, data_type, source_field, target_field, data_type_conversion, transform_function, default_value, is_required, is_active, created_at, updated_at) VALUES ('05705446-2114-4677-946f-1117c8e9c388', '83c84ef5-c316-40bb-8cf6-8b574320b7e5', 'measurement_data', 'equipment_code', 'equipment_code', 'string', NULL, NULL, true, true, '2025-07-06 17:55:59.684228', '2025-07-06 17:55:59.684228');
INSERT INTO public.data_source_field_mappings (id, data_source_id, data_type, source_field, target_field, data_type_conversion, transform_function, default_value, is_required, is_active, created_at, updated_at) VALUES ('5186697b-291b-4d1c-b7f0-782d5705c022', '83c84ef5-c316-40bb-8cf6-8b574320b7e5', 'measurement_data', 'measurement_code', 'measurement_code', 'string', NULL, NULL, true, true, '2025-07-06 17:55:59.705766', '2025-07-06 17:55:59.705766');
INSERT INTO public.data_source_field_mappings (id, data_source_id, data_type, source_field, target_field, data_type_conversion, transform_function, default_value, is_required, is_active, created_at, updated_at) VALUES ('1c8f3d65-1b73-4661-ba1a-617be5dc8f1d', '83c84ef5-c316-40bb-8cf6-8b574320b7e5', 'measurement_data', 'measurement_desc', 'measurement_desc', 'string', NULL, NULL, true, true, '2025-07-06 17:55:59.723865', '2025-07-06 17:55:59.723865');
INSERT INTO public.data_source_field_mappings (id, data_source_id, data_type, source_field, target_field, data_type_conversion, transform_function, default_value, is_required, is_active, created_at, updated_at) VALUES ('5be7ad17-a23f-42c2-970c-5c23a16ba55d', '83c84ef5-c316-40bb-8cf6-8b574320b7e5', 'measurement_data', 'measurement_value', 'measurement_value', 'float', NULL, NULL, true, true, '2025-07-06 17:55:59.744036', '2025-07-06 17:55:59.744036');
INSERT INTO public.data_source_field_mappings (id, data_source_id, data_type, source_field, target_field, data_type_conversion, transform_function, default_value, is_required, is_active, created_at, updated_at) VALUES ('c4e1c0af-8257-4d35-8583-a9c971ae559f', '83c84ef5-c316-40bb-8cf6-8b574320b7e5', 'measurement_data', 'timestamp', 'timestamp', 'datetime', NULL, NULL, true, true, '2025-07-06 17:55:59.761819', '2025-07-06 17:55:59.761819');
INSERT INTO public.data_source_field_mappings (id, data_source_id, data_type, source_field, target_field, data_type_conversion, transform_function, default_value, is_required, is_active, created_at, updated_at) VALUES ('8dd9e1d6-84e2-42e5-b685-f682e0e717a1', '83c84ef5-c316-40bb-8cf6-8b574320b7e5', 'measurement_data', 'usl', 'usl', 'float', NULL, NULL, false, true, '2025-07-06 17:55:59.780024', '2025-07-06 17:55:59.780024');
INSERT INTO public.data_source_field_mappings (id, data_source_id, data_type, source_field, target_field, data_type_conversion, transform_function, default_value, is_required, is_active, created_at, updated_at) VALUES ('10de9b75-fd73-49fc-82e7-937240a797be', '83c84ef5-c316-40bb-8cf6-8b574320b7e5', 'measurement_data', 'lsl', 'lsl', 'float', NULL, NULL, false, true, '2025-07-06 17:55:59.801339', '2025-07-06 17:55:59.801339');
INSERT INTO public.data_source_field_mappings (id, data_source_id, data_type, source_field, target_field, data_type_conversion, transform_function, default_value, is_required, is_active, created_at, updated_at) VALUES ('75d32417-3589-4e71-b481-dc1e18334afd', '83c84ef5-c316-40bb-8cf6-8b574320b7e5', 'measurement_data', 'spec_status', 'spec_status', 'int', NULL, NULL, false, true, '2025-07-06 17:55:59.819448', '2025-07-06 17:55:59.819448');
INSERT INTO public.data_source_field_mappings (id, data_source_id, data_type, source_field, target_field, data_type_conversion, transform_function, default_value, is_required, is_active, created_at, updated_at) VALUES ('0997f9c0-a747-475c-94e4-9662a607e5d2', '83c84ef5-c316-40bb-8cf6-8b574320b7e5', 'measurement_specs', 'equipment_code', 'equipment_code', 'string', NULL, NULL, true, true, '2025-07-06 17:56:04.663224', '2025-07-06 17:56:04.663224');
INSERT INTO public.data_source_field_mappings (id, data_source_id, data_type, source_field, target_field, data_type_conversion, transform_function, default_value, is_required, is_active, created_at, updated_at) VALUES ('7c8f5b2f-0340-47cc-83c0-0d48c4ab123c', '83c84ef5-c316-40bb-8cf6-8b574320b7e5', 'measurement_specs', 'measurement_code', 'measurement_code', 'string', NULL, NULL, true, true, '2025-07-06 17:56:04.695473', '2025-07-06 17:56:04.695473');
INSERT INTO public.data_source_field_mappings (id, data_source_id, data_type, source_field, target_field, data_type_conversion, transform_function, default_value, is_required, is_active, created_at, updated_at) VALUES ('684c9830-a003-4bcb-9bb4-863b226e4741', '83c84ef5-c316-40bb-8cf6-8b574320b7e5', 'measurement_specs', 'usl', 'usl', 'float', NULL, NULL, false, true, '2025-07-06 17:56:04.722493', '2025-07-06 17:56:04.722493');
INSERT INTO public.data_source_field_mappings (id, data_source_id, data_type, source_field, target_field, data_type_conversion, transform_function, default_value, is_required, is_active, created_at, updated_at) VALUES ('3d79702c-28f9-4759-8ca8-231527ecfe6e', '83c84ef5-c316-40bb-8cf6-8b574320b7e5', 'measurement_specs', 'lsl', 'lsl', 'float', NULL, NULL, false, true, '2025-07-06 17:56:04.746599', '2025-07-06 17:56:04.746599');
INSERT INTO public.data_source_field_mappings (id, data_source_id, data_type, source_field, target_field, data_type_conversion, transform_function, default_value, is_required, is_active, created_at, updated_at) VALUES ('8b427015-a2ff-4834-8612-2f1d61c300a1', '83c84ef5-c316-40bb-8cf6-8b574320b7e5', 'measurement_specs', 'target', 'target', 'float', NULL, NULL, false, true, '2025-07-06 17:56:04.768157', '2025-07-06 17:56:04.768157');
INSERT INTO public.data_source_field_mappings (id, data_source_id, data_type, source_field, target_field, data_type_conversion, transform_function, default_value, is_required, is_active, created_at, updated_at) VALUES ('43095ae5-2d08-4a0f-988f-3b1cd268a386', '2881a01f-1eed-4343-b0d1-5d8d22f6744a', 'equipment_status', 'equipment_type', 'equipment_type', 'string', NULL, NULL, true, true, '2025-07-09 08:08:06.810648', '2025-07-09 08:08:06.810648');
INSERT INTO public.data_source_field_mappings (id, data_source_id, data_type, source_field, target_field, data_type_conversion, transform_function, default_value, is_required, is_active, created_at, updated_at) VALUES ('2d561718-71ff-4785-a139-5b4b8ee243f5', '2881a01f-1eed-4343-b0d1-5d8d22f6744a', 'equipment_status', 'equipment_name', 'equipment_name', 'string', NULL, NULL, true, true, '2025-07-09 08:08:06.925829', '2025-07-09 08:08:06.925829');
INSERT INTO public.data_source_field_mappings (id, data_source_id, data_type, source_field, target_field, data_type_conversion, transform_function, default_value, is_required, is_active, created_at, updated_at) VALUES ('7ad3675b-a11c-4bf9-ad04-32f7da2a997a', '2881a01f-1eed-4343-b0d1-5d8d22f6744a', 'equipment_status', 'status', 'status', 'string', NULL, NULL, true, true, '2025-07-09 08:08:06.976035', '2025-07-09 08:08:06.976035');
INSERT INTO public.data_source_field_mappings (id, data_source_id, data_type, source_field, target_field, data_type_conversion, transform_function, default_value, is_required, is_active, created_at, updated_at) VALUES ('7f330c73-8548-4368-bf8f-b7736e1653b5', '2881a01f-1eed-4343-b0d1-5d8d22f6744a', 'equipment_status', 'last_run_time', 'last_run_time', 'datetime', NULL, NULL, false, true, '2025-07-09 08:08:07.026193', '2025-07-09 08:08:07.026193');
INSERT INTO public.data_source_field_mappings (id, data_source_id, data_type, source_field, target_field, data_type_conversion, transform_function, default_value, is_required, is_active, created_at, updated_at) VALUES ('723d309e-2c0d-45bb-af14-123e573ae8b9', '2881a01f-1eed-4343-b0d1-5d8d22f6744a', 'equipment_status', 'equipment_id', 'equipment_code', 'string', NULL, NULL, true, true, '2025-07-09 08:08:06.863769', '2025-07-09 08:17:22.502534');
INSERT INTO public.data_source_field_mappings (id, data_source_id, data_type, source_field, target_field, data_type_conversion, transform_function, default_value, is_required, is_active, created_at, updated_at) VALUES ('d730d31a-28a0-4200-8700-43c885770c07', '2881a01f-1eed-4343-b0d1-5d8d22f6744a', 'measurement_data', 'equipment_type', 'equipment_type', 'string', NULL, NULL, true, true, '2025-07-09 08:17:33.748014', '2025-07-09 08:17:33.748014');
INSERT INTO public.data_source_field_mappings (id, data_source_id, data_type, source_field, target_field, data_type_conversion, transform_function, default_value, is_required, is_active, created_at, updated_at) VALUES ('acf96427-5aa8-4203-9608-34b1c9f88652', '2881a01f-1eed-4343-b0d1-5d8d22f6744a', 'measurement_data', 'equipment_code', 'equipment_code', 'string', NULL, NULL, true, true, '2025-07-09 08:17:33.797506', '2025-07-09 08:17:33.797506');
INSERT INTO public.data_source_field_mappings (id, data_source_id, data_type, source_field, target_field, data_type_conversion, transform_function, default_value, is_required, is_active, created_at, updated_at) VALUES ('489e4c2e-bbf8-474f-8d96-0a8f5bb998ff', '2881a01f-1eed-4343-b0d1-5d8d22f6744a', 'measurement_data', 'measurement_code', 'measurement_code', 'string', NULL, NULL, true, true, '2025-07-09 08:17:33.866247', '2025-07-09 08:17:33.866247');
INSERT INTO public.data_source_field_mappings (id, data_source_id, data_type, source_field, target_field, data_type_conversion, transform_function, default_value, is_required, is_active, created_at, updated_at) VALUES ('a1ceb588-d3d2-4f0a-b8d8-0af3cd57cab3', '2881a01f-1eed-4343-b0d1-5d8d22f6744a', 'measurement_data', 'measurement_desc', 'measurement_desc', 'string', NULL, NULL, true, true, '2025-07-09 08:17:33.917495', '2025-07-09 08:17:33.917495');
INSERT INTO public.data_source_field_mappings (id, data_source_id, data_type, source_field, target_field, data_type_conversion, transform_function, default_value, is_required, is_active, created_at, updated_at) VALUES ('77360d90-b8a0-4b11-b0f0-94457d953a89', '2881a01f-1eed-4343-b0d1-5d8d22f6744a', 'measurement_data', 'measurement_value', 'measurement_value', 'float', NULL, NULL, true, true, '2025-07-09 08:17:33.967039', '2025-07-09 08:17:33.967039');
INSERT INTO public.data_source_field_mappings (id, data_source_id, data_type, source_field, target_field, data_type_conversion, transform_function, default_value, is_required, is_active, created_at, updated_at) VALUES ('1ec39d07-64e9-4ff1-9564-035d9a08870a', '2881a01f-1eed-4343-b0d1-5d8d22f6744a', 'measurement_data', 'timestamp', 'timestamp', 'datetime', NULL, NULL, true, true, '2025-07-09 08:17:34.015179', '2025-07-09 08:17:34.015179');
INSERT INTO public.data_source_field_mappings (id, data_source_id, data_type, source_field, target_field, data_type_conversion, transform_function, default_value, is_required, is_active, created_at, updated_at) VALUES ('43b64057-07b9-4b42-a404-9547106fb644', '2881a01f-1eed-4343-b0d1-5d8d22f6744a', 'measurement_data', 'usl', 'usl', 'float', NULL, NULL, false, true, '2025-07-09 08:17:34.064038', '2025-07-09 08:17:34.064038');
INSERT INTO public.data_source_field_mappings (id, data_source_id, data_type, source_field, target_field, data_type_conversion, transform_function, default_value, is_required, is_active, created_at, updated_at) VALUES ('e6303285-963a-4518-9d99-d130a158abab', '2881a01f-1eed-4343-b0d1-5d8d22f6744a', 'measurement_data', 'lsl', 'lsl', 'float', NULL, NULL, false, true, '2025-07-09 08:17:34.120019', '2025-07-09 08:17:34.120019');
INSERT INTO public.data_source_field_mappings (id, data_source_id, data_type, source_field, target_field, data_type_conversion, transform_function, default_value, is_required, is_active, created_at, updated_at) VALUES ('33c066f0-c490-4ab8-be5f-5cadb5d171bc', '2881a01f-1eed-4343-b0d1-5d8d22f6744a', 'measurement_data', 'spec_status', 'spec_status', 'int', NULL, NULL, false, true, '2025-07-09 08:17:34.169709', '2025-07-09 08:17:34.169709');


--
-- TOC entry 5286 (class 0 OID 19901)
-- Dependencies: 223
-- Data for Name: data_source_mappings; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- TOC entry 5287 (class 0 OID 19910)
-- Dependencies: 224
-- Data for Name: file_shares; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- TOC entry 5288 (class 0 OID 19916)
-- Dependencies: 225
-- Data for Name: measurement_specs; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.measurement_specs (measurement_code, usl, lsl, target, created_at, updated_at) VALUES ('TG-001', 260.000, 200.000, 230.000, '2025-07-04 20:59:49.917146+09', '2025-07-04 20:59:49.917146+09');
INSERT INTO public.measurement_specs (measurement_code, usl, lsl, target, created_at, updated_at) VALUES ('TG-002', 15.000, 5.000, 10.000, '2025-07-04 20:59:49.917146+09', '2025-07-04 20:59:49.917146+09');
INSERT INTO public.measurement_specs (measurement_code, usl, lsl, target, created_at, updated_at) VALUES ('TF-928', 3000000.000, 2800000.000, 2900000.000, '2025-07-04 20:59:49.917146+09', '2025-07-04 20:59:49.917146+09');
INSERT INTO public.measurement_specs (measurement_code, usl, lsl, target, created_at, updated_at) VALUES ('TF-929', 3200000.000, 3000000.000, 3100000.000, '2025-07-04 20:59:49.917146+09', '2025-07-04 20:59:49.917146+09');
INSERT INTO public.measurement_specs (measurement_code, usl, lsl, target, created_at, updated_at) VALUES ('TP-101', 30.000, 20.000, 25.000, '2025-07-04 20:59:49.917146+09', '2025-07-04 20:59:49.917146+09');
INSERT INTO public.measurement_specs (measurement_code, usl, lsl, target, created_at, updated_at) VALUES ('TP-102', 70.000, 60.000, 65.000, '2025-07-04 20:59:49.917146+09', '2025-07-04 20:59:49.917146+09');
INSERT INTO public.measurement_specs (measurement_code, usl, lsl, target, created_at, updated_at) VALUES ('TS-201', 1300.000, 1200.000, 1250.000, '2025-07-04 20:59:49.917146+09', '2025-07-04 20:59:49.917146+09');
INSERT INTO public.measurement_specs (measurement_code, usl, lsl, target, created_at, updated_at) VALUES ('PC-101', 4.000, 3.000, 3.500, '2025-07-04 20:59:49.917146+09', '2025-07-04 20:59:49.917146+09');
INSERT INTO public.measurement_specs (measurement_code, usl, lsl, target, created_at, updated_at) VALUES ('TC-101', 90.000, 80.000, 85.000, '2025-07-04 20:59:49.917146+09', '2025-07-04 20:59:49.917146+09');
INSERT INTO public.measurement_specs (measurement_code, usl, lsl, target, created_at, updated_at) VALUES ('FL-201', 500.000, 400.000, 450.000, '2025-07-04 20:59:49.917146+09', '2025-07-04 20:59:49.917146+09');
INSERT INTO public.measurement_specs (measurement_code, usl, lsl, target, created_at, updated_at) VALUES ('LV-101', 80.000, 70.000, 75.000, '2025-07-04 20:59:49.917146+09', '2025-07-04 20:59:49.917146+09');
INSERT INTO public.measurement_specs (measurement_code, usl, lsl, target, created_at, updated_at) VALUES ('PR-101', 107.000, 95.000, 101.300, '2025-07-04 20:59:49.917146+09', '2025-07-04 20:59:49.917146+09');
INSERT INTO public.measurement_specs (measurement_code, usl, lsl, target, created_at, updated_at) VALUES ('PO-101', 90.000, 80.000, 85.000, '2025-07-04 20:59:49.917146+09', '2025-07-04 20:59:49.917146+09');
INSERT INTO public.measurement_specs (measurement_code, usl, lsl, target, created_at, updated_at) VALUES ('TH-101', 260.000, 240.000, 250.000, '2025-07-04 20:59:49.917146+09', '2025-07-04 20:59:49.917146+09');
INSERT INTO public.measurement_specs (measurement_code, usl, lsl, target, created_at, updated_at) VALUES ('PW-101', 130.000, 120.000, 125.000, '2025-07-04 20:59:49.917146+09', '2025-07-04 20:59:49.917146+09');
INSERT INTO public.measurement_specs (measurement_code, usl, lsl, target, created_at, updated_at) VALUES ('DF-101', 3.000, 2.000, 2.500, '2025-07-04 20:59:49.917146+09', '2025-07-04 20:59:49.917146+09');
INSERT INTO public.measurement_specs (measurement_code, usl, lsl, target, created_at, updated_at) VALUES ('TR-101', 360.000, 340.000, 350.000, '2025-07-04 20:59:49.917146+09', '2025-07-04 20:59:49.917146+09');
INSERT INTO public.measurement_specs (measurement_code, usl, lsl, target, created_at, updated_at) VALUES ('PR-102', 30.000, 20.000, 25.000, '2025-07-04 20:59:49.917146+09', '2025-07-04 20:59:49.917146+09');


--
-- TOC entry 5313 (class 0 OID 21528)
-- Dependencies: 252
-- Data for Name: mvp_module_group_access; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- TOC entry 5289 (class 0 OID 19921)
-- Dependencies: 226
-- Data for Name: mvp_module_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- TOC entry 5312 (class 0 OID 21509)
-- Dependencies: 251
-- Data for Name: mvp_module_user_access; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- TOC entry 5290 (class 0 OID 19927)
-- Dependencies: 227
-- Data for Name: mvp_modules; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.mvp_modules (id, workspace_id, module_name, display_name, description, version, is_active, is_installed, config, sort_order, icon, color, created_by, updated_by, created_at, updated_at, module_type, route_path, module_path, template, permissions) VALUES ('79a68e0c-9592-4bda-bdb4-6641da95dad6', 'c3296531-4c75-4547-99b2-a6635e54fc87', 'total_monitoring', 'Total Monitoring', 'Comprehensive monitoring system with dynamic database connections, real-time process flows, and public sharing capabilities', '1.0.0', true, true, '{"features": [{"id": "database_setup", "name": "Database Setup", "description": "Configure and manage database connections with encryption", "icon": "database", "color": "#3B82F6", "route": "/database-setup", "component": "DatabaseSetup", "is_implemented": true, "sort_order": 1}, {"id": "process_flow_editor", "name": "Process Flow Editor", "description": "Design process flows with auto-save and data mapping", "icon": "workflow", "color": "#10B981", "route": "/process-flow-editor", "component": "ProcessFlowEditor", "is_implemented": true, "sort_order": 2}, {"id": "process_flow_monitoring", "name": "Process Flow Monitoring", "description": "Monitor process flows with real-time data", "icon": "monitor", "color": "#F59E0B", "route": "/process-flow-monitoring", "component": "ProcessFlowMonitoring", "is_implemented": true, "sort_order": 3}, {"id": "process_flow_publish", "name": "Process Flow Publish", "description": "Publish flows for public access without authentication", "icon": "share", "color": "#8B5CF6", "route": "/process-flow-publish", "component": "ProcessFlowPublish", "is_implemented": true, "sort_order": 4}], "database_support": ["POSTGRESQL", "MSSQL", "MYSQL", "ORACLE"], "encryption": "AES-256", "multi_tenant": true, "group_isolation": true, "public_sharing": true, "real_time_monitoring": true}', 1, 'monitor', '#3B82F6', 'system', NULL, '2025-07-28 16:25:38.649202+09', '2025-07-28 16:25:38.649202+09', 'dashboard', '/total-monitoring', NULL, 'total_monitoring_template', '{"view": ["*"], "edit": ["admin", "write"], "delete": ["admin"], "configure_db": ["admin"], "publish_flows": ["admin", "write"], "monitor_flows": ["*"]}');
INSERT INTO public.mvp_modules (id, workspace_id, module_name, display_name, description, version, is_active, is_installed, config, sort_order, icon, color, created_by, updated_by, created_at, updated_at, module_type, route_path, module_path, template, permissions) VALUES ('39f80bda-0469-4ea9-86b1-887215c92e04', 'c3296531-4c75-4547-99b2-a6635e54fc87', 'total_monitoring_database_setup', 'Database Setup', 'Configure encrypted database connections with multi-tenant support', '1.0.0', true, true, '{"parent_module": "total_monitoring", "feature_type": "database_setup", "is_sub_feature": true}', 1, 'database', '#3B82F6', 'system', NULL, '2025-07-28 16:25:38.649202+09', '2025-07-28 16:25:38.649202+09', 'custom', '/total-monitoring/database-setup', NULL, 'sub_feature_template', '{"view": ["*"], "edit": ["admin", "write"], "delete": ["admin"]}');
INSERT INTO public.mvp_modules (id, workspace_id, module_name, display_name, description, version, is_active, is_installed, config, sort_order, icon, color, created_by, updated_by, created_at, updated_at, module_type, route_path, module_path, template, permissions) VALUES ('04104db4-fd06-4470-8795-801d6ba08d37', 'c3296531-4c75-4547-99b2-a6635e54fc87', 'total_monitoring_process_flow_editor', 'Process Flow Editor', 'ReactFlow-based process flow design with Equipment and Instrument nodes', '1.0.0', true, true, '{"parent_module": "total_monitoring", "feature_type": "process_flow_editor", "is_sub_feature": true}', 2, 'workflow', '#10B981', 'system', NULL, '2025-07-28 16:25:38.649202+09', '2025-07-28 16:25:38.649202+09', 'custom', '/total-monitoring/process-flow-editor', NULL, 'sub_feature_template', '{"view": ["*"], "edit": ["admin", "write"], "delete": ["admin"]}');
INSERT INTO public.mvp_modules (id, workspace_id, module_name, display_name, description, version, is_active, is_installed, config, sort_order, icon, color, created_by, updated_by, created_at, updated_at, module_type, route_path, module_path, template, permissions) VALUES ('732f0e57-7251-4c3b-af08-f2aa233a0739', 'c3296531-4c75-4547-99b2-a6635e54fc87', 'total_monitoring_process_flow_monitoring', 'Process Flow Monitoring', 'Real-time monitoring with live data visualization and alarm management', '1.0.0', true, true, '{"parent_module": "total_monitoring", "feature_type": "process_flow_monitoring", "is_sub_feature": true}', 3, 'activity', '#F59E0B', 'system', NULL, '2025-07-28 16:25:38.649202+09', '2025-07-28 16:25:38.649202+09', 'custom', '/total-monitoring/process-flow-monitoring', NULL, 'sub_feature_template', '{"view": ["*"], "edit": ["admin", "write"], "delete": ["admin"]}');
INSERT INTO public.mvp_modules (id, workspace_id, module_name, display_name, description, version, is_active, is_installed, config, sort_order, icon, color, created_by, updated_by, created_at, updated_at, module_type, route_path, module_path, template, permissions) VALUES ('17b27d65-0702-4b9a-8f40-a0129ba914d3', 'c3296531-4c75-4547-99b2-a6635e54fc87', 'total_monitoring_process_flow_publish', 'Process Flow Publish', 'Public sharing system with unique URLs and view tracking', '1.0.0', true, true, '{"parent_module": "total_monitoring", "feature_type": "process_flow_publish", "is_sub_feature": true}', 4, 'share', '#8B5CF6', 'system', NULL, '2025-07-28 16:25:38.649202+09', '2025-07-28 16:25:38.649202+09', 'custom', '/total-monitoring/process-flow-publish', NULL, 'sub_feature_template', '{"view": ["*"], "edit": ["admin", "write"], "delete": ["admin"]}');


--
-- TOC entry 5291 (class 0 OID 19936)
-- Dependencies: 228
-- Data for Name: personal_test_equipment_status; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.personal_test_equipment_status (equipment_type, equipment_code, equipment_name, status, last_run_time) VALUES ('B1', 'B101', '차압기', 'PAUSE', '2025-05-27 10:23:31+09');
INSERT INTO public.personal_test_equipment_status (equipment_type, equipment_code, equipment_name, status, last_run_time) VALUES ('C1', 'C101', '흡착기', 'ACTIVE', '2025-05-27 10:22:31+09');
INSERT INTO public.personal_test_equipment_status (equipment_type, equipment_code, equipment_name, status, last_run_time) VALUES ('C2', 'C201', '측정기', 'ACTIVE', '2025-05-27 10:21:31+09');
INSERT INTO public.personal_test_equipment_status (equipment_type, equipment_code, equipment_name, status, last_run_time) VALUES ('D1', 'D101', '압축기', 'ACTIVE', '2025-05-28 09:45:00+09');
INSERT INTO public.personal_test_equipment_status (equipment_type, equipment_code, equipment_name, status, last_run_time) VALUES ('D2', 'D201', '펌프', 'STOP', '2025-05-26 15:30:00+09');
INSERT INTO public.personal_test_equipment_status (equipment_type, equipment_code, equipment_name, status, last_run_time) VALUES ('E1', 'E101', '탱크', 'ACTIVE', '2025-05-28 10:05:00+09');
INSERT INTO public.personal_test_equipment_status (equipment_type, equipment_code, equipment_name, status, last_run_time) VALUES ('E2', 'E201', '저장탱크', 'ACTIVE', '2025-05-28 10:10:00+09');
INSERT INTO public.personal_test_equipment_status (equipment_type, equipment_code, equipment_name, status, last_run_time) VALUES ('F1', 'F101', '밸브', 'ACTIVE', '2025-05-28 10:15:00+09');
INSERT INTO public.personal_test_equipment_status (equipment_type, equipment_code, equipment_name, status, last_run_time) VALUES ('F2', 'F201', '제어밸브', 'PAUSE', '2025-05-27 18:00:00+09');
INSERT INTO public.personal_test_equipment_status (equipment_type, equipment_code, equipment_name, status, last_run_time) VALUES ('G1', 'G101', '히터', 'ACTIVE', '2025-05-28 08:00:00+09');
INSERT INTO public.personal_test_equipment_status (equipment_type, equipment_code, equipment_name, status, last_run_time) VALUES ('G2', 'G201', '예열기', 'ACTIVE', '2025-05-28 07:30:00+09');
INSERT INTO public.personal_test_equipment_status (equipment_type, equipment_code, equipment_name, status, last_run_time) VALUES ('H1', 'H101', '냉각기', 'ACTIVE', '2025-05-28 09:00:00+09');
INSERT INTO public.personal_test_equipment_status (equipment_type, equipment_code, equipment_name, status, last_run_time) VALUES ('H2', 'H201', '응축기', 'STOP', '2025-05-25 12:00:00+09');
INSERT INTO public.personal_test_equipment_status (equipment_type, equipment_code, equipment_name, status, last_run_time) VALUES ('I1', 'I101', '혼합기', 'ACTIVE', '2025-05-28 10:20:00+09');
INSERT INTO public.personal_test_equipment_status (equipment_type, equipment_code, equipment_name, status, last_run_time) VALUES ('I2', 'I201', '교반기', 'ACTIVE', '2025-05-28 10:25:00+09');
INSERT INTO public.personal_test_equipment_status (equipment_type, equipment_code, equipment_name, status, last_run_time) VALUES ('J1', 'J101', '분리기', 'PAUSE', '2025-05-27 20:00:00+09');
INSERT INTO public.personal_test_equipment_status (equipment_type, equipment_code, equipment_name, status, last_run_time) VALUES ('J2', 'J201', '여과기', 'ACTIVE', '2025-05-28 09:30:00+09');
INSERT INTO public.personal_test_equipment_status (equipment_type, equipment_code, equipment_name, status, last_run_time) VALUES ('K1', 'K101', '반응기', 'ACTIVE', '2025-05-28 06:00:00+09');
INSERT INTO public.personal_test_equipment_status (equipment_type, equipment_code, equipment_name, status, last_run_time) VALUES ('K2', 'K201', '촉매반응기', 'ACTIVE', '2025-05-28 05:00:00+09');
INSERT INTO public.personal_test_equipment_status (equipment_type, equipment_code, equipment_name, status, last_run_time) VALUES ('A1', 'A101', '감압기', 'ACTIVE', '2025-05-28 10:00:00+09');


--
-- TOC entry 5292 (class 0 OID 19940)
-- Dependencies: 229
-- Data for Name: personal_test_measurement_data; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.personal_test_measurement_data (id, equipment_type, equipment_code, measurement_code, measurement_desc, measurement_value, "timestamp", usl, lsl, spec_status) VALUES (1, 'A1', 'A101', 'TG-001', '압력', 230.000, '2025-06-27 21:48:30.995239+09', NULL, NULL, 0);
INSERT INTO public.personal_test_measurement_data (id, equipment_type, equipment_code, measurement_code, measurement_desc, measurement_value, "timestamp", usl, lsl, spec_status) VALUES (2, 'A1', 'A101', 'TG-002', '전단차압', 10.000, '2025-06-27 21:48:30.995239+09', NULL, NULL, 0);
INSERT INTO public.personal_test_measurement_data (id, equipment_type, equipment_code, measurement_code, measurement_desc, measurement_value, "timestamp", usl, lsl, spec_status) VALUES (3, 'B1', 'B101', 'TF-928', '흡입력', 2900000.010, '2025-06-27 21:48:30.995239+09', NULL, NULL, 0);
INSERT INTO public.personal_test_measurement_data (id, equipment_type, equipment_code, measurement_code, measurement_desc, measurement_value, "timestamp", usl, lsl, spec_status) VALUES (4, 'B1', 'B101', 'TF-929', '토출압', 3100000.000, '2025-06-27 21:48:30.995239+09', NULL, NULL, 0);
INSERT INTO public.personal_test_measurement_data (id, equipment_type, equipment_code, measurement_code, measurement_desc, measurement_value, "timestamp", usl, lsl, spec_status) VALUES (5, 'C1', 'C101', 'TP-101', '온도', 25.500, '2025-06-27 21:48:30.995239+09', NULL, NULL, 0);
INSERT INTO public.personal_test_measurement_data (id, equipment_type, equipment_code, measurement_code, measurement_desc, measurement_value, "timestamp", usl, lsl, spec_status) VALUES (6, 'C1', 'C101', 'TP-102', '습도', 65.300, '2025-06-27 21:48:30.995239+09', NULL, NULL, 0);
INSERT INTO public.personal_test_measurement_data (id, equipment_type, equipment_code, measurement_code, measurement_desc, measurement_value, "timestamp", usl, lsl, spec_status) VALUES (7, 'C2', 'C201', 'TS-201', '유량', 1250.000, '2025-06-27 21:48:30.995239+09', NULL, NULL, 0);
INSERT INTO public.personal_test_measurement_data (id, equipment_type, equipment_code, measurement_code, measurement_desc, measurement_value, "timestamp", usl, lsl, spec_status) VALUES (8, 'D1', 'D101', 'PC-101', '압축비', 3.500, '2025-06-27 21:48:30.995239+09', NULL, NULL, 0);
INSERT INTO public.personal_test_measurement_data (id, equipment_type, equipment_code, measurement_code, measurement_desc, measurement_value, "timestamp", usl, lsl, spec_status) VALUES (9, 'D1', 'D101', 'TC-101', '온도', 85.200, '2025-06-27 21:48:30.995239+09', NULL, NULL, 0);
INSERT INTO public.personal_test_measurement_data (id, equipment_type, equipment_code, measurement_code, measurement_desc, measurement_value, "timestamp", usl, lsl, spec_status) VALUES (10, 'D2', 'D201', 'FL-201', '유량', 450.750, '2025-06-27 21:48:30.995239+09', NULL, NULL, 0);
INSERT INTO public.personal_test_measurement_data (id, equipment_type, equipment_code, measurement_code, measurement_desc, measurement_value, "timestamp", usl, lsl, spec_status) VALUES (11, 'E1', 'E101', 'LV-101', '레벨', 75.000, '2025-06-27 21:48:30.995239+09', NULL, NULL, 0);
INSERT INTO public.personal_test_measurement_data (id, equipment_type, equipment_code, measurement_code, measurement_desc, measurement_value, "timestamp", usl, lsl, spec_status) VALUES (12, 'E1', 'E101', 'PR-101', '압력', 101.300, '2025-06-27 21:48:30.995239+09', NULL, NULL, 0);
INSERT INTO public.personal_test_measurement_data (id, equipment_type, equipment_code, measurement_code, measurement_desc, measurement_value, "timestamp", usl, lsl, spec_status) VALUES (13, 'F1', 'F101', 'PO-101', '개도율', 85.000, '2025-06-27 21:48:30.995239+09', NULL, NULL, 0);
INSERT INTO public.personal_test_measurement_data (id, equipment_type, equipment_code, measurement_code, measurement_desc, measurement_value, "timestamp", usl, lsl, spec_status) VALUES (14, 'G1', 'G101', 'TH-101', '온도', 250.000, '2025-06-27 21:48:30.995239+09', NULL, NULL, 0);
INSERT INTO public.personal_test_measurement_data (id, equipment_type, equipment_code, measurement_code, measurement_desc, measurement_value, "timestamp", usl, lsl, spec_status) VALUES (15, 'G1', 'G101', 'PW-101', '전력', 125.500, '2025-06-27 21:48:30.995239+09', NULL, NULL, 0);
INSERT INTO public.personal_test_measurement_data (id, equipment_type, equipment_code, measurement_code, measurement_desc, measurement_value, "timestamp", usl, lsl, spec_status) VALUES (16, 'H1', 'H101', 'TC-101', '냉각온도', -15.000, '2025-06-27 21:48:30.995239+09', NULL, NULL, 0);
INSERT INTO public.personal_test_measurement_data (id, equipment_type, equipment_code, measurement_code, measurement_desc, measurement_value, "timestamp", usl, lsl, spec_status) VALUES (17, 'I1', 'I101', 'SP-101', '회전속도', 1800.000, '2025-06-27 21:48:30.995239+09', NULL, NULL, 0);
INSERT INTO public.personal_test_measurement_data (id, equipment_type, equipment_code, measurement_code, measurement_desc, measurement_value, "timestamp", usl, lsl, spec_status) VALUES (18, 'J1', 'J101', 'DF-101', '차압', 2.500, '2025-06-27 21:48:30.995239+09', NULL, NULL, 0);
INSERT INTO public.personal_test_measurement_data (id, equipment_type, equipment_code, measurement_code, measurement_desc, measurement_value, "timestamp", usl, lsl, spec_status) VALUES (19, 'K1', 'K101', 'TR-101', '반응온도', 350.000, '2025-06-27 21:48:30.995239+09', NULL, NULL, 0);
INSERT INTO public.personal_test_measurement_data (id, equipment_type, equipment_code, measurement_code, measurement_desc, measurement_value, "timestamp", usl, lsl, spec_status) VALUES (20, 'K1', 'K101', 'PR-101', '반응압력', 25.000, '2025-06-27 21:48:30.995239+09', NULL, NULL, 0);


--
-- TOC entry 5294 (class 0 OID 19946)
-- Dependencies: 231
-- Data for Name: personal_test_process_flow_versions; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.personal_test_process_flow_versions (id, flow_id, version_number, flow_data, name, description, created_by, created_at, is_published, published_at, publish_token, data_source_id, scope_type, visibility_scope, shared_with_workspace) VALUES ('ddabe7a9-7fff-4b7b-a92b-b9665bd0b7e9', 'eed16ebd-efe5-4f5c-be40-5466ff4356a0', 1, '{"edges": [{"id": "reactflow__edge-_1751085089714-B1_1751085115749", "type": "smoothstep", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "_1751085089714", "target": "B1_1751085115749", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-_1751085089714-G1_1751085108606", "type": "straight", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "_1751085089714", "target": "G1_1751085108606", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-B1_1751085115749-E1_1751085118930", "type": "default", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "B1_1751085115749", "target": "E1_1751085118930", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-E1_1751085118930-E2_1751085155514", "type": "smoothstep", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "E1_1751085118930", "target": "E2_1751085155514", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-G1_1751085108606-E2_1751085155514", "type": "default", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "G1_1751085108606", "target": "E2_1751085155514", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}], "nodes": [{"id": "_1751085089714", "data": {"icon": "settings", "label": "감압기", "status": "STOP", "equipmentCode": "A101", "equipmentName": "감압기", "equipmentType": "A1", "displayMeasurements": ["TG-001", "TG-002"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": -90, "y": 80}, "selected": false, "positionAbsolute": {"x": -90, "y": 80}}, {"id": "G1_1751085108606", "data": {"icon": "flame", "label": "히터", "status": "STOP", "equipmentCode": "G101", "equipmentName": "히터", "equipmentType": "G1", "displayMeasurements": ["TH-101", "PW-101"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": -90, "y": 450}, "selected": false, "positionAbsolute": {"x": -90, "y": 450}}, {"id": "B1_1751085115749", "data": {"icon": "activity", "label": "차압기", "status": "STOP", "equipmentCode": "B101", "equipmentName": "차압기", "equipmentType": "B1", "displayMeasurements": ["TF-928"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 130, "y": 450}, "selected": false, "positionAbsolute": {"x": 130, "y": 450}}, {"id": "E1_1751085118930", "data": {"icon": "database", "label": "탱크", "status": "STOP", "equipmentCode": "E101", "equipmentName": "탱크", "equipmentType": "E1", "displayMeasurements": ["LV-101"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 350, "y": 800}, "selected": false, "positionAbsolute": {"x": 350, "y": 800}}, {"id": "E2_1751085155514", "data": {"icon": "archive", "label": "저장탱크", "status": "STOP", "equipmentCode": "E201", "equipmentName": "저장탱크", "equipmentType": "E2", "displayMeasurements": []}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 60, "y": 1110}, "selected": true, "positionAbsolute": {"x": 60, "y": 1110}}]}', '샘플공정도2 - Version 2025. 7. 3. 오후 9:44:50', 'Saved from editor at 2025. 7. 3. 오후 9:44:50', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-03 21:44:50.85315+09', false, NULL, NULL, NULL, 'USER', 'PRIVATE', false);
INSERT INTO public.personal_test_process_flow_versions (id, flow_id, version_number, flow_data, name, description, created_by, created_at, is_published, published_at, publish_token, data_source_id, scope_type, visibility_scope, shared_with_workspace) VALUES ('6539cfd8-c74c-4f00-95a4-6741dce027bd', 'eed16ebd-efe5-4f5c-be40-5466ff4356a0', 2, '{"edges": [{"id": "reactflow__edge-_1751085089714-B1_1751085115749", "type": "smoothstep", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "_1751085089714", "target": "B1_1751085115749", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-_1751085089714-G1_1751085108606", "type": "straight", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "_1751085089714", "target": "G1_1751085108606", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-B1_1751085115749-E1_1751085118930", "type": "default", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "B1_1751085115749", "target": "E1_1751085118930", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-E1_1751085118930-E2_1751085155514", "type": "smoothstep", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "E1_1751085118930", "target": "E2_1751085155514", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-G1_1751085108606-E2_1751085155514", "type": "default", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "G1_1751085108606", "target": "E2_1751085155514", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}], "nodes": [{"id": "_1751085089714", "data": {"icon": "settings", "label": "감압기", "status": "STOP", "equipmentCode": "A101", "equipmentName": "감압기", "equipmentType": "A1", "displayMeasurements": ["TG-001", "TG-002"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": -90, "y": 80}, "selected": false, "positionAbsolute": {"x": -90, "y": 80}}, {"id": "G1_1751085108606", "data": {"icon": "flame", "label": "히터", "status": "STOP", "equipmentCode": "G101", "equipmentName": "히터", "equipmentType": "G1", "displayMeasurements": ["TH-101", "PW-101"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": -90, "y": 450}, "selected": false, "positionAbsolute": {"x": -90, "y": 450}}, {"id": "B1_1751085115749", "data": {"icon": "activity", "label": "차압기", "status": "STOP", "equipmentCode": "B101", "equipmentName": "차압기", "equipmentType": "B1", "displayMeasurements": ["TF-928"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 130, "y": 450}, "selected": false, "positionAbsolute": {"x": 130, "y": 450}}, {"id": "E1_1751085118930", "data": {"icon": "database", "label": "탱크", "status": "STOP", "equipmentCode": "E101", "equipmentName": "탱크", "equipmentType": "E1", "displayMeasurements": ["LV-101"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 350, "y": 800}, "selected": false, "positionAbsolute": {"x": 350, "y": 800}}, {"id": "E2_1751085155514", "data": {"icon": "archive", "label": "저장탱크", "status": "STOP", "equipmentCode": "E201", "equipmentName": "저장탱크", "equipmentType": "E2", "displayMeasurements": []}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 60, "y": 1110}, "selected": true, "positionAbsolute": {"x": 60, "y": 1110}}]}', '샘플공정도2 - Version 2025. 7. 3. 오후 9:45:17', 'Saved from editor at 2025. 7. 3. 오후 9:45:17', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-03 21:45:17.906466+09', false, NULL, NULL, NULL, 'USER', 'PRIVATE', false);
INSERT INTO public.personal_test_process_flow_versions (id, flow_id, version_number, flow_data, name, description, created_by, created_at, is_published, published_at, publish_token, data_source_id, scope_type, visibility_scope, shared_with_workspace) VALUES ('4c3073f7-57df-4ed0-a669-06bf6a9909ce', '116675b3-43cb-4a93-986b-e6c133204d16', 1, '{"edges": [{"id": "reactflow__edge-A1_1751073324228-C2_1751073352895", "type": "step", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "A1_1751073324228", "target": "C2_1751073352895", "animated": false, "selected": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-B1_1751073343571-D2_1751077257073", "type": "step", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "B1_1751073343571", "target": "D2_1751077257073", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-D2_1751083266771-A1_1751083245170", "type": "default", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "D2_1751083266771", "target": "A1_1751083245170", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-B1_1751083289433-A1_1751083312881", "type": "smoothstep", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "B1_1751083289433", "target": "A1_1751083312881", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-D2_1751077257073-E2_1751083457125", "type": "step", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "D2_1751077257073", "target": "E2_1751083457125", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-E2_1751083457125-G1_1751083499986", "type": "straight", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "E2_1751083457125", "target": "G1_1751083499986", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-G1_1751083499986-D1_1751083531907", "type": "smoothstep", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "G1_1751083499986", "target": "D1_1751083531907", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-D1_1751083531907-E1_1751083480473", "type": "default", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "D1_1751083531907", "target": "E1_1751083480473", "animated": false, "selectable": true, "sourceHandle": null, "targetHandle": null}], "nodes": [{"id": "A1_1751073324228", "data": {"icon": "gauge", "label": "감압기", "status": "STOP", "equipmentCode": "A101", "equipmentName": "감압기", "equipmentType": "A1", "displayMeasurements": ["TG-001", "TG-002"]}, "type": "equipment", "style": {"width": 211, "height": 170}, "width": 211, "height": 170, "dragging": false, "position": {"x": 130, "y": 200}, "resizing": false, "selected": false, "positionAbsolute": {"x": 130, "y": 200}}, {"id": "B1_1751073343571", "data": {"icon": "activity", "label": "차압기", "status": "STOP", "equipmentCode": "B101", "equipmentName": "차압기", "equipmentType": "B1", "displayMeasurements": ["TF-928", "TF-929"]}, "type": "equipment", "style": {"width": 208, "height": 170}, "width": 208, "height": 170, "dragging": false, "position": {"x": 360, "y": 200}, "resizing": false, "selected": false, "positionAbsolute": {"x": 360, "y": 200}}, {"id": "C2_1751073352895", "data": {"icon": "thermometer", "label": "측정기", "status": "STOP", "equipmentCode": "C201", "equipmentName": "측정기", "equipmentType": "C2", "displayMeasurements": ["TS-201"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 135.5, "y": 525.6838827115021}, "selected": false, "positionAbsolute": {"x": 135.03774814099847, "y": 525.6838827115021}}, {"id": "D2_1751077257073", "data": {"icon": "zap", "label": "펌프", "status": "STOP", "equipmentCode": "D201", "equipmentName": "펌프", "equipmentType": "D2", "displayMeasurements": ["FL-201"]}, "type": "equipment", "style": {"width": 210, "height": 220}, "width": 210, "height": 220, "dragging": false, "position": {"x": 430, "y": 500}, "resizing": false, "selected": false, "positionAbsolute": {"x": 430, "y": 500}}, {"id": "group_1751077454819", "data": {"color": "#ff8080", "label": "Group"}, "type": "group", "style": {"width": 1276, "height": 808, "zIndex": -1}, "width": 1276, "height": 808, "dragging": false, "position": {"x": 40, "y": 120}, "resizing": false, "selected": false, "positionAbsolute": {"x": 40, "y": 120}}, {"id": "A1_1751083245170", "data": {"icon": "gauge", "label": "감압기", "status": "STOP", "equipmentCode": "A101", "equipmentName": "감압기", "equipmentType": "A1", "displayMeasurements": ["TG-001", "TG-002"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 660, "y": 530}, "selected": false, "positionAbsolute": {"x": 660, "y": 530}}, {"id": "D2_1751083266771", "data": {"icon": "zap", "label": "펌프", "status": "STOP", "equipmentCode": "D201", "equipmentName": "펌프", "equipmentType": "D2", "displayMeasurements": ["FL-201"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 720, "y": 200}, "selected": false, "positionAbsolute": {"x": 720, "y": 200}}, {"id": "B1_1751083289433", "data": {"icon": "activity", "label": "차압기", "status": "STOP", "equipmentCode": "B101", "equipmentName": "차압기", "equipmentType": "B1", "displayMeasurements": ["TF-928", "TF-929"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 930, "y": 200}, "selected": false, "positionAbsolute": {"x": 930, "y": 200}}, {"id": "A1_1751083312881", "data": {"icon": "gauge", "label": "감압기", "status": "STOP", "equipmentCode": "A101", "equipmentName": "감압기", "equipmentType": "A1", "displayMeasurements": ["TG-001", "TG-002"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 1000, "y": 550}, "selected": false, "positionAbsolute": {"x": 1000, "y": 550}}, {"id": "group_1751083444956", "data": {"color": "#3b82f6", "label": "Group"}, "type": "group", "style": {"width": 550, "height": 510, "zIndex": -1}, "width": 550, "height": 510, "dragging": false, "position": {"x": -1370, "y": 480}, "resizing": false, "selected": false, "positionAbsolute": {"x": -1370, "y": 480}}, {"id": "E2_1751083457125", "data": {"icon": "archive", "label": "저장탱크", "status": "STOP", "equipmentCode": "E201", "equipmentName": "저장탱크", "equipmentType": "E2", "displayMeasurements": []}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": -1250, "y": 580}, "selected": false, "positionAbsolute": {"x": -1250, "y": 580}}, {"id": "E1_1751083480473", "data": {"icon": "database", "label": "탱크", "status": "STOP", "equipmentCode": "E101", "equipmentName": "탱크", "equipmentType": "E1", "displayMeasurements": ["LV-101", "PR-101"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 720, "y": 1180}, "selected": false, "positionAbsolute": {"x": 720, "y": 1180}}, {"id": "group_1751083486315", "data": {"color": "#75f09a", "label": "Group"}, "type": "group", "style": {"width": 960, "height": 450, "zIndex": -1}, "width": 960, "height": 450, "dragging": false, "position": {"x": 50, "y": 1080}, "resizing": false, "selected": false, "positionAbsolute": {"x": 50, "y": 1080}}, {"id": "G1_1751083499986", "data": {"icon": "flame", "label": "히터", "status": "STOP", "equipmentCode": "G101", "equipmentName": "히터", "equipmentType": "G1", "displayMeasurements": ["TH-101", "PW-101"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 90, "y": 1170}, "selected": false, "positionAbsolute": {"x": 90, "y": 1170}}, {"id": "D1_1751083531907", "data": {"icon": "wind", "label": "압축기", "status": "STOP", "equipmentCode": "D101", "equipmentName": "압축기", "equipmentType": "D1", "displayMeasurements": ["PC-101", "TC-101"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 400, "y": 1170}, "selected": false, "positionAbsolute": {"x": 400, "y": 1170}}]}', '샘플 공정도 - Version 2025. 7. 3. 오후 9:45:33', 'Saved from editor at 2025. 7. 3. 오후 9:45:33', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-03 21:45:33.205275+09', false, NULL, NULL, NULL, 'USER', 'PRIVATE', false);
INSERT INTO public.personal_test_process_flow_versions (id, flow_id, version_number, flow_data, name, description, created_by, created_at, is_published, published_at, publish_token, data_source_id, scope_type, visibility_scope, shared_with_workspace) VALUES ('14b928c1-90ca-49c1-af44-17011cec512b', '116675b3-43cb-4a93-986b-e6c133204d16', 2, '{"edges": [{"id": "reactflow__edge-A1_1751073324228-C2_1751073352895", "type": "step", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "A1_1751073324228", "target": "C2_1751073352895", "animated": false, "selected": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-B1_1751073343571-D2_1751077257073", "type": "step", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "B1_1751073343571", "target": "D2_1751077257073", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-D2_1751083266771-A1_1751083245170", "type": "default", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "D2_1751083266771", "target": "A1_1751083245170", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-B1_1751083289433-A1_1751083312881", "type": "smoothstep", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "B1_1751083289433", "target": "A1_1751083312881", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-D2_1751077257073-E2_1751083457125", "type": "step", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "D2_1751077257073", "target": "E2_1751083457125", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-E2_1751083457125-G1_1751083499986", "type": "straight", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "E2_1751083457125", "target": "G1_1751083499986", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-G1_1751083499986-D1_1751083531907", "type": "smoothstep", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "G1_1751083499986", "target": "D1_1751083531907", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-D1_1751083531907-E1_1751083480473", "type": "default", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "D1_1751083531907", "target": "E1_1751083480473", "animated": false, "selectable": true, "sourceHandle": null, "targetHandle": null}], "nodes": [{"id": "A1_1751073324228", "data": {"icon": "gauge", "label": "감압기", "status": "STOP", "equipmentCode": "A101", "equipmentName": "감압기", "equipmentType": "A1", "displayMeasurements": ["TG-001", "TG-002"]}, "type": "equipment", "style": {"width": 211, "height": 170}, "width": 211, "height": 170, "dragging": false, "position": {"x": 130, "y": 200}, "resizing": false, "selected": false, "positionAbsolute": {"x": 130, "y": 200}}, {"id": "B1_1751073343571", "data": {"icon": "activity", "label": "차압기", "status": "STOP", "equipmentCode": "B101", "equipmentName": "차압기", "equipmentType": "B1", "displayMeasurements": ["TF-928", "TF-929"]}, "type": "equipment", "style": {"width": 208, "height": 170}, "width": 208, "height": 170, "dragging": false, "position": {"x": 360, "y": 200}, "resizing": false, "selected": false, "positionAbsolute": {"x": 360, "y": 200}}, {"id": "C2_1751073352895", "data": {"icon": "thermometer", "label": "측정기", "status": "STOP", "equipmentCode": "C201", "equipmentName": "측정기", "equipmentType": "C2", "displayMeasurements": ["TS-201"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 135.5, "y": 525.6838827115021}, "selected": false, "positionAbsolute": {"x": 135.03774814099847, "y": 525.6838827115021}}, {"id": "D2_1751077257073", "data": {"icon": "zap", "label": "펌프", "status": "STOP", "equipmentCode": "D201", "equipmentName": "펌프", "equipmentType": "D2", "displayMeasurements": ["FL-201"]}, "type": "equipment", "style": {"width": 210, "height": 220}, "width": 210, "height": 220, "dragging": false, "position": {"x": 430, "y": 500}, "resizing": false, "selected": false, "positionAbsolute": {"x": 430, "y": 500}}, {"id": "group_1751077454819", "data": {"color": "#ff8080", "label": "Group"}, "type": "group", "style": {"width": 1276, "height": 808, "zIndex": -1}, "width": 1276, "height": 808, "dragging": false, "position": {"x": 40, "y": 120}, "resizing": false, "selected": false, "positionAbsolute": {"x": 40, "y": 120}}, {"id": "A1_1751083245170", "data": {"icon": "gauge", "label": "감압기", "status": "STOP", "equipmentCode": "A101", "equipmentName": "감압기", "equipmentType": "A1", "displayMeasurements": ["TG-001", "TG-002"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 660, "y": 530}, "selected": false, "positionAbsolute": {"x": 660, "y": 530}}, {"id": "D2_1751083266771", "data": {"icon": "zap", "label": "펌프", "status": "STOP", "equipmentCode": "D201", "equipmentName": "펌프", "equipmentType": "D2", "displayMeasurements": ["FL-201"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 720, "y": 200}, "selected": false, "positionAbsolute": {"x": 720, "y": 200}}, {"id": "B1_1751083289433", "data": {"icon": "activity", "label": "차압기", "status": "STOP", "equipmentCode": "B101", "equipmentName": "차압기", "equipmentType": "B1", "displayMeasurements": ["TF-928", "TF-929"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 930, "y": 200}, "selected": false, "positionAbsolute": {"x": 930, "y": 200}}, {"id": "A1_1751083312881", "data": {"icon": "gauge", "label": "감압기", "status": "STOP", "equipmentCode": "A101", "equipmentName": "감압기", "equipmentType": "A1", "displayMeasurements": ["TG-001", "TG-002"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 1000, "y": 550}, "selected": false, "positionAbsolute": {"x": 1000, "y": 550}}, {"id": "group_1751083444956", "data": {"color": "#3b82f6", "label": "Group"}, "type": "group", "style": {"width": 550, "height": 510, "zIndex": -1}, "width": 550, "height": 510, "dragging": false, "position": {"x": -1370, "y": 480}, "resizing": false, "selected": false, "positionAbsolute": {"x": -1370, "y": 480}}, {"id": "E2_1751083457125", "data": {"icon": "archive", "label": "저장탱크", "status": "STOP", "equipmentCode": "E201", "equipmentName": "저장탱크", "equipmentType": "E2", "displayMeasurements": []}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": -1250, "y": 580}, "selected": false, "positionAbsolute": {"x": -1250, "y": 580}}, {"id": "E1_1751083480473", "data": {"icon": "database", "label": "탱크", "status": "STOP", "equipmentCode": "E101", "equipmentName": "탱크", "equipmentType": "E1", "displayMeasurements": ["LV-101", "PR-101"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 720, "y": 1180}, "selected": false, "positionAbsolute": {"x": 720, "y": 1180}}, {"id": "group_1751083486315", "data": {"color": "#75f09a", "label": "Group"}, "type": "group", "style": {"width": 960, "height": 450, "zIndex": -1}, "width": 960, "height": 450, "dragging": false, "position": {"x": 50, "y": 1080}, "resizing": false, "selected": false, "positionAbsolute": {"x": 50, "y": 1080}}, {"id": "G1_1751083499986", "data": {"icon": "flame", "label": "히터", "status": "STOP", "equipmentCode": "G101", "equipmentName": "히터", "equipmentType": "G1", "displayMeasurements": ["TH-101", "PW-101"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 90, "y": 1170}, "selected": false, "positionAbsolute": {"x": 90, "y": 1170}}, {"id": "D1_1751083531907", "data": {"icon": "wind", "label": "압축기", "status": "STOP", "equipmentCode": "D101", "equipmentName": "압축기", "equipmentType": "D1", "displayMeasurements": ["PC-101", "TC-101"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 400, "y": 1170}, "selected": false, "positionAbsolute": {"x": 400, "y": 1170}}, {"id": "text_1751546743566", "data": {"text": "안녕하세요?", "color": "#000000", "padding": 8, "fontSize": 100, "textAlign": "center", "fontWeight": "normal", "borderColor": "#999999", "borderStyle": "none", "borderWidth": 1, "backgroundColor": "#ffffff"}, "type": "text", "width": 500, "height": 166, "dragging": false, "position": {"x": -675, "y": 45}, "selected": true, "positionAbsolute": {"x": -675, "y": 45}}]}', '샘플 공정도 - Version 2025. 7. 3. 오후 9:46:03', 'Saved from editor at 2025. 7. 3. 오후 9:46:03', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-03 21:46:03.105535+09', false, NULL, NULL, NULL, 'USER', 'PRIVATE', false);
INSERT INTO public.personal_test_process_flow_versions (id, flow_id, version_number, flow_data, name, description, created_by, created_at, is_published, published_at, publish_token, data_source_id, scope_type, visibility_scope, shared_with_workspace) VALUES ('873d4603-e8ad-4fec-953d-4d675302862e', '116675b3-43cb-4a93-986b-e6c133204d16', 3, '{"edges": [{"id": "reactflow__edge-A1_1751073324228-C2_1751073352895", "type": "step", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "A1_1751073324228", "target": "C2_1751073352895", "animated": false, "selected": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-B1_1751073343571-D2_1751077257073", "type": "step", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "B1_1751073343571", "target": "D2_1751077257073", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-D2_1751083266771-A1_1751083245170", "type": "default", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "D2_1751083266771", "target": "A1_1751083245170", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-B1_1751083289433-A1_1751083312881", "type": "smoothstep", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "B1_1751083289433", "target": "A1_1751083312881", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-D2_1751077257073-E2_1751083457125", "type": "step", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "D2_1751077257073", "target": "E2_1751083457125", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-E2_1751083457125-G1_1751083499986", "type": "straight", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "E2_1751083457125", "target": "G1_1751083499986", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-G1_1751083499986-D1_1751083531907", "type": "smoothstep", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "G1_1751083499986", "target": "D1_1751083531907", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-D1_1751083531907-E1_1751083480473", "type": "default", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "D1_1751083531907", "target": "E1_1751083480473", "animated": false, "selectable": true, "sourceHandle": null, "targetHandle": null}], "nodes": [{"id": "A1_1751073324228", "data": {"icon": "gauge", "label": "감압기", "status": "STOP", "equipmentCode": "A101", "equipmentName": "감압기", "equipmentType": "A1", "displayMeasurements": ["TG-001", "TG-002"]}, "type": "equipment", "style": {"width": 211, "height": 170}, "width": 211, "height": 170, "dragging": false, "position": {"x": 130, "y": 200}, "resizing": false, "selected": false, "positionAbsolute": {"x": 130, "y": 200}}, {"id": "B1_1751073343571", "data": {"icon": "activity", "label": "차압기", "status": "STOP", "equipmentCode": "B101", "equipmentName": "차압기", "equipmentType": "B1", "displayMeasurements": ["TF-928", "TF-929"]}, "type": "equipment", "style": {"width": 208, "height": 170}, "width": 208, "height": 170, "dragging": false, "position": {"x": 360, "y": 200}, "resizing": false, "selected": false, "positionAbsolute": {"x": 360, "y": 200}}, {"id": "C2_1751073352895", "data": {"icon": "thermometer", "label": "측정기", "status": "STOP", "equipmentCode": "C201", "equipmentName": "측정기", "equipmentType": "C2", "displayMeasurements": ["TS-201"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 135.5, "y": 525.6838827115021}, "selected": false, "positionAbsolute": {"x": 135.03774814099847, "y": 525.6838827115021}}, {"id": "D2_1751077257073", "data": {"icon": "zap", "label": "펌프", "status": "STOP", "equipmentCode": "D201", "equipmentName": "펌프", "equipmentType": "D2", "displayMeasurements": ["FL-201"]}, "type": "equipment", "style": {"width": 210, "height": 220}, "width": 210, "height": 220, "dragging": false, "position": {"x": 430, "y": 500}, "resizing": false, "selected": false, "positionAbsolute": {"x": 430, "y": 500}}, {"id": "group_1751077454819", "data": {"color": "#ff8080", "label": "Group"}, "type": "group", "style": {"width": 1276, "height": 808, "zIndex": -1}, "width": 1276, "height": 808, "dragging": false, "position": {"x": 40, "y": 120}, "resizing": false, "selected": false, "positionAbsolute": {"x": 40, "y": 120}}, {"id": "A1_1751083245170", "data": {"icon": "gauge", "label": "감압기", "status": "STOP", "equipmentCode": "A101", "equipmentName": "감압기", "equipmentType": "A1", "displayMeasurements": ["TG-001", "TG-002"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 660, "y": 530}, "selected": false, "positionAbsolute": {"x": 660, "y": 530}}, {"id": "D2_1751083266771", "data": {"icon": "zap", "label": "펌프", "status": "STOP", "equipmentCode": "D201", "equipmentName": "펌프", "equipmentType": "D2", "displayMeasurements": ["FL-201"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 720, "y": 200}, "selected": false, "positionAbsolute": {"x": 720, "y": 200}}, {"id": "B1_1751083289433", "data": {"icon": "activity", "label": "차압기", "status": "STOP", "equipmentCode": "B101", "equipmentName": "차압기", "equipmentType": "B1", "displayMeasurements": ["TF-928", "TF-929"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 930, "y": 200}, "selected": false, "positionAbsolute": {"x": 930, "y": 200}}, {"id": "A1_1751083312881", "data": {"icon": "gauge", "label": "감압기", "status": "STOP", "equipmentCode": "A101", "equipmentName": "감압기", "equipmentType": "A1", "displayMeasurements": ["TG-001", "TG-002"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 1000, "y": 550}, "selected": false, "positionAbsolute": {"x": 1000, "y": 550}}, {"id": "group_1751083444956", "data": {"color": "#3b82f6", "label": "Group"}, "type": "group", "style": {"width": 550, "height": 510, "zIndex": -1}, "width": 550, "height": 510, "dragging": false, "position": {"x": -1370, "y": 480}, "resizing": false, "selected": false, "positionAbsolute": {"x": -1370, "y": 480}}, {"id": "E2_1751083457125", "data": {"icon": "archive", "label": "저장탱크", "status": "STOP", "equipmentCode": "E201", "equipmentName": "저장탱크", "equipmentType": "E2", "displayMeasurements": []}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": -1250, "y": 580}, "selected": false, "positionAbsolute": {"x": -1250, "y": 580}}, {"id": "E1_1751083480473", "data": {"icon": "database", "label": "탱크", "status": "STOP", "equipmentCode": "E101", "equipmentName": "탱크", "equipmentType": "E1", "displayMeasurements": ["LV-101", "PR-101"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 720, "y": 1180}, "selected": false, "positionAbsolute": {"x": 720, "y": 1180}}, {"id": "group_1751083486315", "data": {"color": "#75f09a", "label": "Group"}, "type": "group", "style": {"width": 960, "height": 450, "zIndex": -1}, "width": 960, "height": 450, "dragging": false, "position": {"x": 50, "y": 1080}, "resizing": false, "selected": false, "positionAbsolute": {"x": 50, "y": 1080}}, {"id": "G1_1751083499986", "data": {"icon": "flame", "label": "히터", "status": "STOP", "equipmentCode": "G101", "equipmentName": "히터", "equipmentType": "G1", "displayMeasurements": ["TH-101", "PW-101"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 90, "y": 1170}, "selected": false, "positionAbsolute": {"x": 90, "y": 1170}}, {"id": "D1_1751083531907", "data": {"icon": "wind", "label": "압축기", "status": "STOP", "equipmentCode": "D101", "equipmentName": "압축기", "equipmentType": "D1", "displayMeasurements": ["PC-101", "TC-101"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 400, "y": 1170}, "selected": false, "positionAbsolute": {"x": 400, "y": 1170}}, {"id": "group_1751546832939", "data": {"color": "#6b7280", "label": "Group", "zIndex": 0, "titleSize": 14, "titleColor": "#374151", "borderStyle": "dashed", "titlePosition": "top", "backgroundColor": "#6b7280", "backgroundOpacity": 10}, "type": "group", "style": {"width": 300, "height": 200}, "width": 300, "height": 200, "position": {"x": -810, "y": 195}}]}', '샘플 공정도 - Version 2025. 7. 3. 오후 9:47:14', 'Saved from editor at 2025. 7. 3. 오후 9:47:14', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-03 21:47:14.410524+09', false, NULL, NULL, NULL, 'USER', 'PRIVATE', false);
INSERT INTO public.personal_test_process_flow_versions (id, flow_id, version_number, flow_data, name, description, created_by, created_at, is_published, published_at, publish_token, data_source_id, scope_type, visibility_scope, shared_with_workspace) VALUES ('510081ab-6bd9-48e5-b238-f3ca24453e21', '116675b3-43cb-4a93-986b-e6c133204d16', 4, '{"edges": [{"id": "reactflow__edge-A1_1751073324228-C2_1751073352895", "type": "step", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "A1_1751073324228", "target": "C2_1751073352895", "animated": false, "selected": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-B1_1751073343571-D2_1751077257073", "type": "step", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "B1_1751073343571", "target": "D2_1751077257073", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-D2_1751083266771-A1_1751083245170", "type": "default", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "D2_1751083266771", "target": "A1_1751083245170", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-B1_1751083289433-A1_1751083312881", "type": "smoothstep", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "B1_1751083289433", "target": "A1_1751083312881", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-D2_1751077257073-E2_1751083457125", "type": "step", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "D2_1751077257073", "target": "E2_1751083457125", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-E2_1751083457125-G1_1751083499986", "type": "straight", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "E2_1751083457125", "target": "G1_1751083499986", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-G1_1751083499986-D1_1751083531907", "type": "smoothstep", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "G1_1751083499986", "target": "D1_1751083531907", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-D1_1751083531907-E1_1751083480473", "type": "default", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "D1_1751083531907", "target": "E1_1751083480473", "animated": false, "selectable": true, "sourceHandle": null, "targetHandle": null}], "nodes": [{"id": "A1_1751073324228", "data": {"icon": "gauge", "label": "감압기", "status": "STOP", "equipmentCode": "A101", "equipmentName": "감압기", "equipmentType": "A1", "displayMeasurements": ["TG-001", "TG-002"]}, "type": "equipment", "style": {"width": 211, "height": 170}, "width": 211, "height": 170, "dragging": false, "position": {"x": 130, "y": 200}, "resizing": false, "selected": false, "positionAbsolute": {"x": 130, "y": 200}}, {"id": "B1_1751073343571", "data": {"icon": "activity", "label": "차압기", "status": "STOP", "equipmentCode": "B101", "equipmentName": "차압기", "equipmentType": "B1", "displayMeasurements": ["TF-928", "TF-929"]}, "type": "equipment", "style": {"width": 208, "height": 170}, "width": 208, "height": 170, "dragging": false, "position": {"x": 360, "y": 200}, "resizing": false, "selected": false, "positionAbsolute": {"x": 360, "y": 200}}, {"id": "C2_1751073352895", "data": {"icon": "thermometer", "label": "측정기", "status": "STOP", "equipmentCode": "C201", "equipmentName": "측정기", "equipmentType": "C2", "displayMeasurements": ["TS-201"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 135.5, "y": 525.6838827115021}, "selected": false, "positionAbsolute": {"x": 135.03774814099847, "y": 525.6838827115021}}, {"id": "D2_1751077257073", "data": {"icon": "zap", "label": "펌프", "status": "STOP", "equipmentCode": "D201", "equipmentName": "펌프", "equipmentType": "D2", "displayMeasurements": ["FL-201"]}, "type": "equipment", "style": {"width": 210, "height": 220}, "width": 210, "height": 220, "dragging": false, "position": {"x": 430, "y": 500}, "resizing": false, "selected": false, "positionAbsolute": {"x": 430, "y": 500}}, {"id": "group_1751077454819", "data": {"color": "#ff8080", "label": "Group"}, "type": "group", "style": {"width": 1276, "height": 808, "zIndex": -1}, "width": 1276, "height": 808, "dragging": false, "position": {"x": 40, "y": 120}, "resizing": false, "selected": false, "positionAbsolute": {"x": 40, "y": 120}}, {"id": "A1_1751083245170", "data": {"icon": "gauge", "label": "감압기", "status": "STOP", "equipmentCode": "A101", "equipmentName": "감압기", "equipmentType": "A1", "displayMeasurements": ["TG-001", "TG-002"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 660, "y": 530}, "selected": false, "positionAbsolute": {"x": 660, "y": 530}}, {"id": "D2_1751083266771", "data": {"icon": "zap", "label": "펌프", "status": "STOP", "equipmentCode": "D201", "equipmentName": "펌프", "equipmentType": "D2", "displayMeasurements": ["FL-201"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 720, "y": 200}, "selected": false, "positionAbsolute": {"x": 720, "y": 200}}, {"id": "B1_1751083289433", "data": {"icon": "activity", "label": "차압기", "status": "STOP", "equipmentCode": "B101", "equipmentName": "차압기", "equipmentType": "B1", "displayMeasurements": ["TF-928", "TF-929"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 930, "y": 200}, "selected": false, "positionAbsolute": {"x": 930, "y": 200}}, {"id": "A1_1751083312881", "data": {"icon": "gauge", "label": "감압기", "status": "STOP", "equipmentCode": "A101", "equipmentName": "감압기", "equipmentType": "A1", "displayMeasurements": ["TG-001", "TG-002"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 1000, "y": 550}, "selected": false, "positionAbsolute": {"x": 1000, "y": 550}}, {"id": "group_1751083444956", "data": {"color": "#3b82f6", "label": "Group"}, "type": "group", "style": {"width": 550, "height": 510, "zIndex": -1}, "width": 550, "height": 510, "dragging": false, "position": {"x": -1370, "y": 480}, "resizing": false, "selected": false, "positionAbsolute": {"x": -1370, "y": 480}}, {"id": "E2_1751083457125", "data": {"icon": "archive", "label": "저장탱크", "status": "STOP", "equipmentCode": "E201", "equipmentName": "저장탱크", "equipmentType": "E2", "displayMeasurements": []}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": -1250, "y": 580}, "selected": false, "positionAbsolute": {"x": -1250, "y": 580}}, {"id": "E1_1751083480473", "data": {"icon": "database", "label": "탱크", "status": "STOP", "equipmentCode": "E101", "equipmentName": "탱크", "equipmentType": "E1", "displayMeasurements": ["LV-101", "PR-101"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 720, "y": 1180}, "selected": false, "positionAbsolute": {"x": 720, "y": 1180}}, {"id": "group_1751083486315", "data": {"color": "#75f09a", "label": "Group"}, "type": "group", "style": {"width": 960, "height": 450, "zIndex": -1}, "width": 960, "height": 450, "dragging": false, "position": {"x": 50, "y": 1080}, "resizing": false, "selected": false, "positionAbsolute": {"x": 50, "y": 1080}}, {"id": "G1_1751083499986", "data": {"icon": "flame", "label": "히터", "status": "STOP", "equipmentCode": "G101", "equipmentName": "히터", "equipmentType": "G1", "displayMeasurements": ["TH-101", "PW-101"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 90, "y": 1170}, "selected": false, "positionAbsolute": {"x": 90, "y": 1170}}, {"id": "D1_1751083531907", "data": {"icon": "wind", "label": "압축기", "status": "STOP", "equipmentCode": "D101", "equipmentName": "압축기", "equipmentType": "D1", "displayMeasurements": ["PC-101", "TC-101"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 400, "y": 1170}, "selected": false, "positionAbsolute": {"x": 400, "y": 1170}}, {"id": "COMMON_1751546846753", "data": {"icon": "settings", "label": "공통설비", "status": "STOP", "equipmentCode": "", "equipmentName": "공통설비", "equipmentType": "COMMON", "displayMeasurements": []}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "position": {"x": -765, "y": 165}}]}', '샘플 공정도 - Version 2025. 7. 3. 오후 9:47:27', 'Saved from editor at 2025. 7. 3. 오후 9:47:27', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-03 21:47:27.852896+09', false, NULL, NULL, NULL, 'USER', 'PRIVATE', false);
INSERT INTO public.personal_test_process_flow_versions (id, flow_id, version_number, flow_data, name, description, created_by, created_at, is_published, published_at, publish_token, data_source_id, scope_type, visibility_scope, shared_with_workspace) VALUES ('f3b36ab5-f31f-46c5-a3a1-154777277bf4', '116675b3-43cb-4a93-986b-e6c133204d16', 5, '{"edges": [{"id": "reactflow__edge-A1_1751073324228-C2_1751073352895", "type": "step", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "A1_1751073324228", "target": "C2_1751073352895", "animated": false, "selected": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-B1_1751073343571-D2_1751077257073", "type": "step", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "B1_1751073343571", "target": "D2_1751077257073", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-D2_1751083266771-A1_1751083245170", "type": "default", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "D2_1751083266771", "target": "A1_1751083245170", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-B1_1751083289433-A1_1751083312881", "type": "smoothstep", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "B1_1751083289433", "target": "A1_1751083312881", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-D2_1751077257073-E2_1751083457125", "type": "step", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "D2_1751077257073", "target": "E2_1751083457125", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-E2_1751083457125-G1_1751083499986", "type": "straight", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "E2_1751083457125", "target": "G1_1751083499986", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-G1_1751083499986-D1_1751083531907", "type": "smoothstep", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "G1_1751083499986", "target": "D1_1751083531907", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-D1_1751083531907-E1_1751083480473", "type": "default", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "D1_1751083531907", "target": "E1_1751083480473", "animated": false, "selectable": true, "sourceHandle": null, "targetHandle": null}], "nodes": [{"id": "A1_1751073324228", "data": {"icon": "gauge", "label": "감압기", "status": "STOP", "equipmentCode": "A101", "equipmentName": "감압기", "equipmentType": "A1", "displayMeasurements": ["TG-001", "TG-002"]}, "type": "equipment", "style": {"width": 211, "height": 170}, "width": 211, "height": 170, "dragging": false, "position": {"x": 130, "y": 200}, "resizing": false, "selected": false, "positionAbsolute": {"x": 130, "y": 200}}, {"id": "B1_1751073343571", "data": {"icon": "activity", "label": "차압기", "status": "STOP", "equipmentCode": "B101", "equipmentName": "차압기", "equipmentType": "B1", "displayMeasurements": ["TF-928", "TF-929"]}, "type": "equipment", "style": {"width": 208, "height": 170}, "width": 208, "height": 170, "dragging": false, "position": {"x": 360, "y": 200}, "resizing": false, "selected": false, "positionAbsolute": {"x": 360, "y": 200}}, {"id": "C2_1751073352895", "data": {"icon": "thermometer", "label": "측정기", "status": "STOP", "equipmentCode": "C201", "equipmentName": "측정기", "equipmentType": "C2", "displayMeasurements": ["TS-201"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 135.5, "y": 525.6838827115021}, "selected": false, "positionAbsolute": {"x": 135.03774814099847, "y": 525.6838827115021}}, {"id": "D2_1751077257073", "data": {"icon": "zap", "label": "펌프", "status": "STOP", "equipmentCode": "D201", "equipmentName": "펌프", "equipmentType": "D2", "displayMeasurements": ["FL-201"]}, "type": "equipment", "style": {"width": 210, "height": 220}, "width": 210, "height": 220, "dragging": false, "position": {"x": 430, "y": 500}, "resizing": false, "selected": false, "positionAbsolute": {"x": 430, "y": 500}}, {"id": "group_1751077454819", "data": {"color": "#ff8080", "label": "Group"}, "type": "group", "style": {"width": 1276, "height": 808, "zIndex": -1}, "width": 1276, "height": 808, "dragging": false, "position": {"x": 40, "y": 120}, "resizing": false, "selected": false, "positionAbsolute": {"x": 40, "y": 120}}, {"id": "A1_1751083245170", "data": {"icon": "gauge", "label": "감압기", "status": "STOP", "equipmentCode": "A101", "equipmentName": "감압기", "equipmentType": "A1", "displayMeasurements": ["TG-001", "TG-002"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 660, "y": 530}, "selected": false, "positionAbsolute": {"x": 660, "y": 530}}, {"id": "D2_1751083266771", "data": {"icon": "zap", "label": "펌프", "status": "STOP", "equipmentCode": "D201", "equipmentName": "펌프", "equipmentType": "D2", "displayMeasurements": ["FL-201"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 720, "y": 200}, "selected": false, "positionAbsolute": {"x": 720, "y": 200}}, {"id": "B1_1751083289433", "data": {"icon": "activity", "label": "차압기", "status": "STOP", "equipmentCode": "B101", "equipmentName": "차압기", "equipmentType": "B1", "displayMeasurements": ["TF-928", "TF-929"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 930, "y": 200}, "selected": false, "positionAbsolute": {"x": 930, "y": 200}}, {"id": "A1_1751083312881", "data": {"icon": "gauge", "label": "감압기", "status": "STOP", "equipmentCode": "A101", "equipmentName": "감압기", "equipmentType": "A1", "displayMeasurements": ["TG-001", "TG-002"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 1000, "y": 550}, "selected": false, "positionAbsolute": {"x": 1000, "y": 550}}, {"id": "group_1751083444956", "data": {"color": "#3b82f6", "label": "Group"}, "type": "group", "style": {"width": 550, "height": 510, "zIndex": -1}, "width": 550, "height": 510, "dragging": false, "position": {"x": -1370, "y": 480}, "resizing": false, "selected": false, "positionAbsolute": {"x": -1370, "y": 480}}, {"id": "E2_1751083457125", "data": {"icon": "archive", "label": "저장탱크", "status": "STOP", "equipmentCode": "E201", "equipmentName": "저장탱크", "equipmentType": "E2", "displayMeasurements": []}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": -1250, "y": 580}, "selected": false, "positionAbsolute": {"x": -1250, "y": 580}}, {"id": "E1_1751083480473", "data": {"icon": "database", "label": "탱크", "status": "STOP", "equipmentCode": "E101", "equipmentName": "탱크", "equipmentType": "E1", "displayMeasurements": ["LV-101", "PR-101"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 720, "y": 1180}, "selected": false, "positionAbsolute": {"x": 720, "y": 1180}}, {"id": "group_1751083486315", "data": {"color": "#75f09a", "label": "Group"}, "type": "group", "style": {"width": 960, "height": 450, "zIndex": -1}, "width": 960, "height": 450, "dragging": false, "position": {"x": 50, "y": 1080}, "resizing": false, "selected": false, "positionAbsolute": {"x": 50, "y": 1080}}, {"id": "G1_1751083499986", "data": {"icon": "flame", "label": "히터", "status": "STOP", "equipmentCode": "G101", "equipmentName": "히터", "equipmentType": "G1", "displayMeasurements": ["TH-101", "PW-101"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 90, "y": 1170}, "selected": false, "positionAbsolute": {"x": 90, "y": 1170}}, {"id": "D1_1751083531907", "data": {"icon": "wind", "label": "압축기", "status": "STOP", "equipmentCode": "D101", "equipmentName": "압축기", "equipmentType": "D1", "displayMeasurements": ["PC-101", "TC-101"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 400, "y": 1170}, "selected": false, "positionAbsolute": {"x": 400, "y": 1170}}, {"id": "text_1751547107155", "data": {"text": "Text", "color": "#000000", "fontSize": 14}, "type": "text", "width": 50, "height": 37, "dragging": false, "position": {"x": -690, "y": 345}, "selected": true}]}', '샘플 공정도 - Version 2025. 7. 3. 오후 9:51:59', 'Saved from editor at 2025. 7. 3. 오후 9:51:59', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-03 21:51:59.760594+09', false, NULL, NULL, NULL, 'USER', 'PRIVATE', false);
INSERT INTO public.personal_test_process_flow_versions (id, flow_id, version_number, flow_data, name, description, created_by, created_at, is_published, published_at, publish_token, data_source_id, scope_type, visibility_scope, shared_with_workspace) VALUES ('30d2dc65-502f-49bb-9dcd-58b280e8dc6d', '116675b3-43cb-4a93-986b-e6c133204d16', 6, '{"edges": [{"id": "reactflow__edge-A1_1751073324228-C2_1751073352895", "type": "step", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "A1_1751073324228", "target": "C2_1751073352895", "animated": false, "selected": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-B1_1751073343571-D2_1751077257073", "type": "step", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "B1_1751073343571", "target": "D2_1751077257073", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-D2_1751083266771-A1_1751083245170", "type": "default", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "D2_1751083266771", "target": "A1_1751083245170", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-B1_1751083289433-A1_1751083312881", "type": "smoothstep", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "B1_1751083289433", "target": "A1_1751083312881", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-D2_1751077257073-E2_1751083457125", "type": "step", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "D2_1751077257073", "target": "E2_1751083457125", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-E2_1751083457125-G1_1751083499986", "type": "straight", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "E2_1751083457125", "target": "G1_1751083499986", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-G1_1751083499986-D1_1751083531907", "type": "smoothstep", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "G1_1751083499986", "target": "D1_1751083531907", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-D1_1751083531907-E1_1751083480473", "type": "default", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "D1_1751083531907", "target": "E1_1751083480473", "animated": false, "selectable": true, "sourceHandle": null, "targetHandle": null}], "nodes": [{"id": "A1_1751073324228", "data": {"icon": "gauge", "label": "감압기", "status": "STOP", "equipmentCode": "A101", "equipmentName": "감압기", "equipmentType": "A1", "displayMeasurements": ["TG-001", "TG-002"]}, "type": "equipment", "style": {"width": 211, "height": 170}, "width": 211, "height": 170, "dragging": false, "position": {"x": 130, "y": 200}, "resizing": false, "selected": false, "positionAbsolute": {"x": 130, "y": 200}}, {"id": "B1_1751073343571", "data": {"icon": "activity", "label": "차압기", "status": "STOP", "equipmentCode": "B101", "equipmentName": "차압기", "equipmentType": "B1", "displayMeasurements": ["TF-928", "TF-929"]}, "type": "equipment", "style": {"width": 208, "height": 170}, "width": 208, "height": 170, "dragging": false, "position": {"x": 360, "y": 200}, "resizing": false, "selected": false, "positionAbsolute": {"x": 360, "y": 200}}, {"id": "C2_1751073352895", "data": {"icon": "thermometer", "label": "측정기", "status": "STOP", "equipmentCode": "C201", "equipmentName": "측정기", "equipmentType": "C2", "displayMeasurements": ["TS-201"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 135.5, "y": 525.6838827115021}, "selected": false, "positionAbsolute": {"x": 135.03774814099847, "y": 525.6838827115021}}, {"id": "D2_1751077257073", "data": {"icon": "zap", "label": "펌프", "status": "STOP", "equipmentCode": "D201", "equipmentName": "펌프", "equipmentType": "D2", "displayMeasurements": ["FL-201"]}, "type": "equipment", "style": {"width": 210, "height": 220}, "width": 210, "height": 220, "dragging": false, "position": {"x": 430, "y": 500}, "resizing": false, "selected": false, "positionAbsolute": {"x": 430, "y": 500}}, {"id": "group_1751077454819", "data": {"color": "#ff8080", "label": "Group"}, "type": "group", "style": {"width": 1276, "height": 808, "zIndex": -1}, "width": 1276, "height": 808, "dragging": false, "position": {"x": 40, "y": 120}, "resizing": false, "selected": false, "positionAbsolute": {"x": 40, "y": 120}}, {"id": "A1_1751083245170", "data": {"icon": "gauge", "label": "감압기", "status": "STOP", "equipmentCode": "A101", "equipmentName": "감압기", "equipmentType": "A1", "displayMeasurements": ["TG-001", "TG-002"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 660, "y": 530}, "selected": false, "positionAbsolute": {"x": 660, "y": 530}}, {"id": "D2_1751083266771", "data": {"icon": "zap", "label": "펌프", "status": "STOP", "equipmentCode": "D201", "equipmentName": "펌프", "equipmentType": "D2", "displayMeasurements": ["FL-201"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 720, "y": 200}, "selected": false, "positionAbsolute": {"x": 720, "y": 200}}, {"id": "B1_1751083289433", "data": {"icon": "activity", "label": "차압기", "status": "STOP", "equipmentCode": "B101", "equipmentName": "차압기", "equipmentType": "B1", "displayMeasurements": ["TF-928", "TF-929"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 930, "y": 200}, "selected": false, "positionAbsolute": {"x": 930, "y": 200}}, {"id": "A1_1751083312881", "data": {"icon": "gauge", "label": "감압기", "status": "STOP", "equipmentCode": "A101", "equipmentName": "감압기", "equipmentType": "A1", "displayMeasurements": ["TG-001", "TG-002"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 1000, "y": 550}, "selected": false, "positionAbsolute": {"x": 1000, "y": 550}}, {"id": "group_1751083444956", "data": {"color": "#3b82f6", "label": "Group"}, "type": "group", "style": {"width": 550, "height": 510, "zIndex": -1}, "width": 550, "height": 510, "dragging": false, "position": {"x": -1370, "y": 480}, "resizing": false, "selected": false, "positionAbsolute": {"x": -1370, "y": 480}}, {"id": "E2_1751083457125", "data": {"icon": "archive", "label": "저장탱크", "status": "STOP", "equipmentCode": "E201", "equipmentName": "저장탱크", "equipmentType": "E2", "displayMeasurements": []}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": -1250, "y": 580}, "selected": false, "positionAbsolute": {"x": -1250, "y": 580}}, {"id": "E1_1751083480473", "data": {"icon": "database", "label": "탱크", "status": "STOP", "equipmentCode": "E101", "equipmentName": "탱크", "equipmentType": "E1", "displayMeasurements": ["LV-101", "PR-101"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 720, "y": 1180}, "selected": false, "positionAbsolute": {"x": 720, "y": 1180}}, {"id": "group_1751083486315", "data": {"color": "#75f09a", "label": "Group"}, "type": "group", "style": {"width": 960, "height": 450, "zIndex": -1}, "width": 960, "height": 450, "dragging": false, "position": {"x": 50, "y": 1080}, "resizing": false, "selected": false, "positionAbsolute": {"x": 50, "y": 1080}}, {"id": "G1_1751083499986", "data": {"icon": "flame", "label": "히터", "status": "STOP", "equipmentCode": "G101", "equipmentName": "히터", "equipmentType": "G1", "displayMeasurements": ["TH-101", "PW-101"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 90, "y": 1170}, "selected": false, "positionAbsolute": {"x": 90, "y": 1170}}, {"id": "D1_1751083531907", "data": {"icon": "wind", "label": "압축기", "status": "STOP", "equipmentCode": "D101", "equipmentName": "압축기", "equipmentType": "D1", "displayMeasurements": ["PC-101", "TC-101"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 400, "y": 1170}, "selected": false, "positionAbsolute": {"x": 400, "y": 1170}}, {"id": "COMMON_1751546846753", "data": {"icon": "settings", "label": "공통설비", "status": "STOP", "equipmentCode": "", "equipmentName": "공통설비", "equipmentType": "COMMON", "displayMeasurements": []}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": -555, "y": 75}, "selected": false, "positionAbsolute": {"x": -555, "y": 75}}, {"id": "text_1751547206517", "data": {"text": "Text", "color": "#000000", "padding": 8, "fontSize": 14, "textAlign": "center", "fontWeight": "normal", "borderColor": "#999999", "borderStyle": "none", "borderWidth": 1, "backgroundColor": "#ffffff"}, "type": "text", "width": 50, "height": 37, "dragging": false, "position": {"x": -315, "y": -15}, "selected": true}]}', '샘플 공정도 - Version 2025. 7. 3. 오후 9:53:33', 'Saved from editor at 2025. 7. 3. 오후 9:53:33', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-03 21:53:33.042345+09', false, NULL, NULL, NULL, 'USER', 'PRIVATE', false);
INSERT INTO public.personal_test_process_flow_versions (id, flow_id, version_number, flow_data, name, description, created_by, created_at, is_published, published_at, publish_token, data_source_id, scope_type, visibility_scope, shared_with_workspace) VALUES ('372acfdb-847d-4c9c-8a5c-2bd56390a01d', '116675b3-43cb-4a93-986b-e6c133204d16', 7, '{"edges": [{"id": "reactflow__edge-A1_1751073324228-C2_1751073352895", "type": "step", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "A1_1751073324228", "target": "C2_1751073352895", "animated": false, "selected": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-B1_1751073343571-D2_1751077257073", "type": "step", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "B1_1751073343571", "target": "D2_1751077257073", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-D2_1751083266771-A1_1751083245170", "type": "default", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "D2_1751083266771", "target": "A1_1751083245170", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-B1_1751083289433-A1_1751083312881", "type": "smoothstep", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "B1_1751083289433", "target": "A1_1751083312881", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-D2_1751077257073-E2_1751083457125", "type": "step", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "D2_1751077257073", "target": "E2_1751083457125", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-E2_1751083457125-G1_1751083499986", "type": "straight", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "E2_1751083457125", "target": "G1_1751083499986", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-G1_1751083499986-D1_1751083531907", "type": "smoothstep", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "G1_1751083499986", "target": "D1_1751083531907", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-D1_1751083531907-E1_1751083480473", "type": "default", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "D1_1751083531907", "target": "E1_1751083480473", "animated": false, "selectable": true, "sourceHandle": null, "targetHandle": null}], "nodes": [{"id": "A1_1751073324228", "data": {"icon": "gauge", "label": "감압기", "status": "STOP", "equipmentCode": "A101", "equipmentName": "감압기", "equipmentType": "A1", "displayMeasurements": ["TG-001", "TG-002"]}, "type": "equipment", "style": {"width": 211, "height": 170}, "width": 211, "height": 170, "dragging": false, "position": {"x": 130, "y": 200}, "resizing": false, "selected": false, "positionAbsolute": {"x": 130, "y": 200}}, {"id": "B1_1751073343571", "data": {"icon": "activity", "label": "차압기", "status": "STOP", "equipmentCode": "B101", "equipmentName": "차압기", "equipmentType": "B1", "displayMeasurements": ["TF-928", "TF-929"]}, "type": "equipment", "style": {"width": 208, "height": 170}, "width": 208, "height": 170, "dragging": false, "position": {"x": 360, "y": 200}, "resizing": false, "selected": false, "positionAbsolute": {"x": 360, "y": 200}}, {"id": "C2_1751073352895", "data": {"icon": "thermometer", "label": "측정기", "status": "STOP", "equipmentCode": "C201", "equipmentName": "측정기", "equipmentType": "C2", "displayMeasurements": ["TS-201"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 135.5, "y": 525.6838827115021}, "selected": false, "positionAbsolute": {"x": 135.03774814099847, "y": 525.6838827115021}}, {"id": "D2_1751077257073", "data": {"icon": "zap", "label": "펌프", "status": "STOP", "equipmentCode": "D201", "equipmentName": "펌프", "equipmentType": "D2", "displayMeasurements": ["FL-201"]}, "type": "equipment", "style": {"width": 210, "height": 220}, "width": 210, "height": 220, "dragging": false, "position": {"x": 430, "y": 500}, "resizing": false, "selected": false, "positionAbsolute": {"x": 430, "y": 500}}, {"id": "group_1751077454819", "data": {"color": "#ff8080", "label": "Group"}, "type": "group", "style": {"width": 1276, "height": 808, "zIndex": -1}, "width": 1276, "height": 808, "dragging": false, "position": {"x": 40, "y": 120}, "resizing": false, "selected": false, "positionAbsolute": {"x": 40, "y": 120}}, {"id": "A1_1751083245170", "data": {"icon": "gauge", "label": "감압기", "status": "STOP", "equipmentCode": "A101", "equipmentName": "감압기", "equipmentType": "A1", "displayMeasurements": ["TG-001", "TG-002"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 660, "y": 530}, "selected": false, "positionAbsolute": {"x": 660, "y": 530}}, {"id": "D2_1751083266771", "data": {"icon": "zap", "label": "펌프", "status": "STOP", "equipmentCode": "D201", "equipmentName": "펌프", "equipmentType": "D2", "displayMeasurements": ["FL-201"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 720, "y": 200}, "selected": false, "positionAbsolute": {"x": 720, "y": 200}}, {"id": "B1_1751083289433", "data": {"icon": "activity", "label": "차압기", "status": "STOP", "equipmentCode": "B101", "equipmentName": "차압기", "equipmentType": "B1", "displayMeasurements": ["TF-928", "TF-929"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 930, "y": 200}, "selected": false, "positionAbsolute": {"x": 930, "y": 200}}, {"id": "A1_1751083312881", "data": {"icon": "gauge", "label": "감압기", "status": "STOP", "equipmentCode": "A101", "equipmentName": "감압기", "equipmentType": "A1", "displayMeasurements": ["TG-001", "TG-002"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 1000, "y": 550}, "selected": false, "positionAbsolute": {"x": 1000, "y": 550}}, {"id": "group_1751083444956", "data": {"color": "#3b82f6", "label": "Group"}, "type": "group", "style": {"width": 550, "height": 510, "zIndex": -1}, "width": 550, "height": 510, "dragging": false, "position": {"x": -1370, "y": 480}, "resizing": false, "selected": false, "positionAbsolute": {"x": -1370, "y": 480}}, {"id": "E2_1751083457125", "data": {"icon": "archive", "label": "저장탱크", "status": "STOP", "equipmentCode": "E201", "equipmentName": "저장탱크", "equipmentType": "E2", "displayMeasurements": []}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": -1250, "y": 580}, "selected": false, "positionAbsolute": {"x": -1250, "y": 580}}, {"id": "E1_1751083480473", "data": {"icon": "database", "label": "탱크", "status": "STOP", "equipmentCode": "E101", "equipmentName": "탱크", "equipmentType": "E1", "displayMeasurements": ["LV-101", "PR-101"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 720, "y": 1180}, "selected": false, "positionAbsolute": {"x": 720, "y": 1180}}, {"id": "group_1751083486315", "data": {"color": "#75f09a", "label": "Group"}, "type": "group", "style": {"width": 960, "height": 450, "zIndex": -1}, "width": 960, "height": 450, "dragging": false, "position": {"x": 50, "y": 1080}, "resizing": false, "selected": false, "positionAbsolute": {"x": 50, "y": 1080}}, {"id": "G1_1751083499986", "data": {"icon": "flame", "label": "히터", "status": "STOP", "equipmentCode": "G101", "equipmentName": "히터", "equipmentType": "G1", "displayMeasurements": ["TH-101", "PW-101"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 90, "y": 1170}, "selected": false, "positionAbsolute": {"x": 90, "y": 1170}}, {"id": "D1_1751083531907", "data": {"icon": "wind", "label": "압축기", "status": "STOP", "equipmentCode": "D101", "equipmentName": "압축기", "equipmentType": "D1", "displayMeasurements": ["PC-101", "TC-101"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 400, "y": 1170}, "selected": false, "positionAbsolute": {"x": 400, "y": 1170}}, {"id": "COMMON_1751546846753", "data": {"icon": "settings", "label": "공통설비", "status": "STOP", "equipmentCode": "", "equipmentName": "공통설비", "equipmentType": "COMMON", "displayMeasurements": []}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "position": {"x": -765, "y": 165}}, {"id": "text_1751547256763", "data": {"text": "Text", "color": "#000000", "fontSize": 14}, "type": "text", "width": 50, "height": 37, "position": {"x": -225, "y": 0}}]}', '샘플 공정도 - Version 2025. 7. 3. 오후 9:54:18', 'Saved from editor at 2025. 7. 3. 오후 9:54:18', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-03 21:54:18.247571+09', false, NULL, NULL, NULL, 'USER', 'PRIVATE', false);
INSERT INTO public.personal_test_process_flow_versions (id, flow_id, version_number, flow_data, name, description, created_by, created_at, is_published, published_at, publish_token, data_source_id, scope_type, visibility_scope, shared_with_workspace) VALUES ('9c48242e-7991-43c1-80d6-b9ee98b316e3', '116675b3-43cb-4a93-986b-e6c133204d16', 8, '{"edges": [{"id": "reactflow__edge-A1_1751073324228-C2_1751073352895", "type": "step", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "A1_1751073324228", "target": "C2_1751073352895", "animated": false, "selected": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-B1_1751073343571-D2_1751077257073", "type": "step", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "B1_1751073343571", "target": "D2_1751077257073", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-D2_1751083266771-A1_1751083245170", "type": "default", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "D2_1751083266771", "target": "A1_1751083245170", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-B1_1751083289433-A1_1751083312881", "type": "smoothstep", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "B1_1751083289433", "target": "A1_1751083312881", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-D2_1751077257073-E2_1751083457125", "type": "step", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "D2_1751077257073", "target": "E2_1751083457125", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-E2_1751083457125-G1_1751083499986", "type": "straight", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "E2_1751083457125", "target": "G1_1751083499986", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-G1_1751083499986-D1_1751083531907", "type": "smoothstep", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "G1_1751083499986", "target": "D1_1751083531907", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-D1_1751083531907-E1_1751083480473", "type": "default", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "D1_1751083531907", "target": "E1_1751083480473", "animated": false, "selectable": true, "sourceHandle": null, "targetHandle": null}], "nodes": [{"id": "A1_1751073324228", "data": {"icon": "gauge", "label": "감압기", "status": "STOP", "equipmentCode": "A101", "equipmentName": "감압기", "equipmentType": "A1", "displayMeasurements": ["TG-001", "TG-002"]}, "type": "equipment", "style": {"width": 211, "height": 170}, "width": 211, "height": 170, "dragging": false, "position": {"x": 130, "y": 200}, "resizing": false, "selected": false, "positionAbsolute": {"x": 130, "y": 200}}, {"id": "B1_1751073343571", "data": {"icon": "activity", "label": "차압기", "status": "STOP", "equipmentCode": "B101", "equipmentName": "차압기", "equipmentType": "B1", "displayMeasurements": ["TF-928", "TF-929"]}, "type": "equipment", "style": {"width": 208, "height": 170}, "width": 208, "height": 170, "dragging": false, "position": {"x": 360, "y": 200}, "resizing": false, "selected": false, "positionAbsolute": {"x": 360, "y": 200}}, {"id": "C2_1751073352895", "data": {"icon": "thermometer", "label": "측정기", "status": "STOP", "equipmentCode": "C201", "equipmentName": "측정기", "equipmentType": "C2", "displayMeasurements": ["TS-201"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 135.5, "y": 525.6838827115021}, "selected": false, "positionAbsolute": {"x": 135.03774814099847, "y": 525.6838827115021}}, {"id": "D2_1751077257073", "data": {"icon": "zap", "label": "펌프", "status": "STOP", "equipmentCode": "D201", "equipmentName": "펌프", "equipmentType": "D2", "displayMeasurements": ["FL-201"]}, "type": "equipment", "style": {"width": 210, "height": 220}, "width": 210, "height": 220, "dragging": false, "position": {"x": 430, "y": 500}, "resizing": false, "selected": false, "positionAbsolute": {"x": 430, "y": 500}}, {"id": "group_1751077454819", "data": {"color": "#ff8080", "label": "Group"}, "type": "group", "style": {"width": 1276, "height": 808, "zIndex": -1}, "width": 1276, "height": 808, "dragging": false, "position": {"x": 40, "y": 120}, "resizing": false, "selected": false, "positionAbsolute": {"x": 40, "y": 120}}, {"id": "A1_1751083245170", "data": {"icon": "gauge", "label": "감압기", "status": "STOP", "equipmentCode": "A101", "equipmentName": "감압기", "equipmentType": "A1", "displayMeasurements": ["TG-001", "TG-002"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 660, "y": 530}, "selected": false, "positionAbsolute": {"x": 660, "y": 530}}, {"id": "D2_1751083266771", "data": {"icon": "zap", "label": "펌프", "status": "STOP", "equipmentCode": "D201", "equipmentName": "펌프", "equipmentType": "D2", "displayMeasurements": ["FL-201"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 720, "y": 200}, "selected": false, "positionAbsolute": {"x": 720, "y": 200}}, {"id": "B1_1751083289433", "data": {"icon": "activity", "label": "차압기", "status": "STOP", "equipmentCode": "B101", "equipmentName": "차압기", "equipmentType": "B1", "displayMeasurements": ["TF-928", "TF-929"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 930, "y": 200}, "selected": false, "positionAbsolute": {"x": 930, "y": 200}}, {"id": "A1_1751083312881", "data": {"icon": "gauge", "label": "감압기", "status": "STOP", "equipmentCode": "A101", "equipmentName": "감압기", "equipmentType": "A1", "displayMeasurements": ["TG-001", "TG-002"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 1000, "y": 550}, "selected": false, "positionAbsolute": {"x": 1000, "y": 550}}, {"id": "group_1751083444956", "data": {"color": "#3b82f6", "label": "Group"}, "type": "group", "style": {"width": 550, "height": 510, "zIndex": -1}, "width": 550, "height": 510, "dragging": false, "position": {"x": -1370, "y": 480}, "resizing": false, "selected": false, "positionAbsolute": {"x": -1370, "y": 480}}, {"id": "E2_1751083457125", "data": {"icon": "archive", "label": "저장탱크", "status": "STOP", "equipmentCode": "E201", "equipmentName": "저장탱크", "equipmentType": "E2", "displayMeasurements": []}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": -1250, "y": 580}, "selected": false, "positionAbsolute": {"x": -1250, "y": 580}}, {"id": "E1_1751083480473", "data": {"icon": "database", "label": "탱크", "status": "STOP", "equipmentCode": "E101", "equipmentName": "탱크", "equipmentType": "E1", "displayMeasurements": ["LV-101", "PR-101"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 720, "y": 1180}, "selected": false, "positionAbsolute": {"x": 720, "y": 1180}}, {"id": "group_1751083486315", "data": {"color": "#75f09a", "label": "Group"}, "type": "group", "style": {"width": 960, "height": 450, "zIndex": -1}, "width": 960, "height": 450, "dragging": false, "position": {"x": 50, "y": 1080}, "resizing": false, "selected": false, "positionAbsolute": {"x": 50, "y": 1080}}, {"id": "G1_1751083499986", "data": {"icon": "flame", "label": "히터", "status": "STOP", "equipmentCode": "G101", "equipmentName": "히터", "equipmentType": "G1", "displayMeasurements": ["TH-101", "PW-101"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 90, "y": 1170}, "selected": false, "positionAbsolute": {"x": 90, "y": 1170}}, {"id": "D1_1751083531907", "data": {"icon": "wind", "label": "압축기", "status": "STOP", "equipmentCode": "D101", "equipmentName": "압축기", "equipmentType": "D1", "displayMeasurements": ["PC-101", "TC-101"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 400, "y": 1170}, "selected": false, "positionAbsolute": {"x": 400, "y": 1170}}, {"id": "COMMON_1751546846753", "data": {"icon": "settings", "label": "공통설비", "status": "STOP", "equipmentCode": "", "equipmentName": "공통설비", "equipmentType": "COMMON", "displayMeasurements": []}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": -555, "y": 75}, "selected": false, "positionAbsolute": {"x": -555, "y": 75}}, {"id": "text_1751547206517", "data": {"text": "Text", "color": "#000000", "padding": 8, "fontSize": 14, "textAlign": "center", "fontWeight": "normal", "borderColor": "#999999", "borderStyle": "none", "borderWidth": 1, "backgroundColor": "#ffffff"}, "type": "text", "width": 50, "height": 37, "dragging": false, "position": {"x": -315, "y": -15}, "selected": false}, {"id": "text_1751547574665", "data": {"text": "Text", "color": "#000000", "fontSize": 14}, "type": "text", "width": 50, "height": 37, "dragging": false, "position": {"x": 120, "y": -15}, "selected": false}]}', '샘플 공정도 - Version 2025. 7. 3. 오후 9:59:38', 'Saved from editor at 2025. 7. 3. 오후 9:59:38', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-03 21:59:38.517208+09', false, NULL, NULL, NULL, 'USER', 'PRIVATE', false);
INSERT INTO public.personal_test_process_flow_versions (id, flow_id, version_number, flow_data, name, description, created_by, created_at, is_published, published_at, publish_token, data_source_id, scope_type, visibility_scope, shared_with_workspace) VALUES ('48582e9c-85ae-45d7-89f7-83721bae7e0f', '116675b3-43cb-4a93-986b-e6c133204d16', 9, '{"edges": [{"id": "reactflow__edge-A1_1751073324228-C2_1751073352895", "type": "step", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "A1_1751073324228", "target": "C2_1751073352895", "animated": false, "selected": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-B1_1751073343571-D2_1751077257073", "type": "step", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "B1_1751073343571", "target": "D2_1751077257073", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-D2_1751083266771-A1_1751083245170", "type": "default", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "D2_1751083266771", "target": "A1_1751083245170", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-B1_1751083289433-A1_1751083312881", "type": "smoothstep", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "B1_1751083289433", "target": "A1_1751083312881", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-D2_1751077257073-E2_1751083457125", "type": "step", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "D2_1751077257073", "target": "E2_1751083457125", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-E2_1751083457125-G1_1751083499986", "type": "straight", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "E2_1751083457125", "target": "G1_1751083499986", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-G1_1751083499986-D1_1751083531907", "type": "smoothstep", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "G1_1751083499986", "target": "D1_1751083531907", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-D1_1751083531907-E1_1751083480473", "type": "default", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "D1_1751083531907", "target": "E1_1751083480473", "animated": false, "selectable": true, "sourceHandle": null, "targetHandle": null}], "nodes": [{"id": "A1_1751073324228", "data": {"icon": "gauge", "label": "감압기", "status": "STOP", "equipmentCode": "A101", "equipmentName": "감압기", "equipmentType": "A1", "displayMeasurements": ["TG-001", "TG-002"]}, "type": "equipment", "style": {"width": 211, "height": 170}, "width": 211, "height": 170, "dragging": false, "position": {"x": 130, "y": 200}, "resizing": false, "selected": false, "positionAbsolute": {"x": 130, "y": 200}}, {"id": "B1_1751073343571", "data": {"icon": "activity", "label": "차압기", "status": "STOP", "equipmentCode": "B101", "equipmentName": "차압기", "equipmentType": "B1", "displayMeasurements": ["TF-928", "TF-929"]}, "type": "equipment", "style": {"width": 208, "height": 170}, "width": 208, "height": 170, "dragging": false, "position": {"x": 360, "y": 200}, "resizing": false, "selected": false, "positionAbsolute": {"x": 360, "y": 200}}, {"id": "C2_1751073352895", "data": {"icon": "thermometer", "label": "측정기", "status": "STOP", "equipmentCode": "C201", "equipmentName": "측정기", "equipmentType": "C2", "displayMeasurements": ["TS-201"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 135.5, "y": 525.6838827115021}, "selected": false, "positionAbsolute": {"x": 135.03774814099847, "y": 525.6838827115021}}, {"id": "D2_1751077257073", "data": {"icon": "zap", "label": "펌프", "status": "STOP", "equipmentCode": "D201", "equipmentName": "펌프", "equipmentType": "D2", "displayMeasurements": ["FL-201"]}, "type": "equipment", "style": {"width": 210, "height": 220}, "width": 210, "height": 220, "dragging": false, "position": {"x": 430, "y": 500}, "resizing": false, "selected": false, "positionAbsolute": {"x": 430, "y": 500}}, {"id": "group_1751077454819", "data": {"color": "#ff8080", "label": "Group"}, "type": "group", "style": {"width": 1276, "height": 808, "zIndex": -1}, "width": 1276, "height": 808, "dragging": false, "position": {"x": 40, "y": 120}, "resizing": false, "selected": false, "positionAbsolute": {"x": 40, "y": 120}}, {"id": "A1_1751083245170", "data": {"icon": "gauge", "label": "감압기", "status": "STOP", "equipmentCode": "A101", "equipmentName": "감압기", "equipmentType": "A1", "displayMeasurements": ["TG-001", "TG-002"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 660, "y": 530}, "selected": false, "positionAbsolute": {"x": 660, "y": 530}}, {"id": "D2_1751083266771", "data": {"icon": "zap", "label": "펌프", "status": "STOP", "equipmentCode": "D201", "equipmentName": "펌프", "equipmentType": "D2", "displayMeasurements": ["FL-201"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 720, "y": 200}, "selected": false, "positionAbsolute": {"x": 720, "y": 200}}, {"id": "B1_1751083289433", "data": {"icon": "activity", "label": "차압기", "status": "STOP", "equipmentCode": "B101", "equipmentName": "차압기", "equipmentType": "B1", "displayMeasurements": ["TF-928", "TF-929"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 930, "y": 200}, "selected": false, "positionAbsolute": {"x": 930, "y": 200}}, {"id": "A1_1751083312881", "data": {"icon": "gauge", "label": "감압기", "status": "STOP", "equipmentCode": "A101", "equipmentName": "감압기", "equipmentType": "A1", "displayMeasurements": ["TG-001", "TG-002"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 1000, "y": 550}, "selected": false, "positionAbsolute": {"x": 1000, "y": 550}}, {"id": "group_1751083444956", "data": {"color": "#3b82f6", "label": "Group"}, "type": "group", "style": {"width": 550, "height": 510, "zIndex": -1}, "width": 550, "height": 510, "dragging": false, "position": {"x": -1370, "y": 480}, "resizing": false, "selected": false, "positionAbsolute": {"x": -1370, "y": 480}}, {"id": "E2_1751083457125", "data": {"icon": "archive", "label": "저장탱크", "status": "STOP", "equipmentCode": "E201", "equipmentName": "저장탱크", "equipmentType": "E2", "displayMeasurements": []}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": -1250, "y": 580}, "selected": false, "positionAbsolute": {"x": -1250, "y": 580}}, {"id": "E1_1751083480473", "data": {"icon": "database", "label": "탱크", "status": "STOP", "equipmentCode": "E101", "equipmentName": "탱크", "equipmentType": "E1", "displayMeasurements": ["LV-101", "PR-101"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 720, "y": 1180}, "selected": false, "positionAbsolute": {"x": 720, "y": 1180}}, {"id": "group_1751083486315", "data": {"color": "#75f09a", "label": "Group"}, "type": "group", "style": {"width": 960, "height": 450, "zIndex": -1}, "width": 960, "height": 450, "dragging": false, "position": {"x": 50, "y": 1080}, "resizing": false, "selected": false, "positionAbsolute": {"x": 50, "y": 1080}}, {"id": "G1_1751083499986", "data": {"icon": "flame", "label": "히터", "status": "STOP", "equipmentCode": "G101", "equipmentName": "히터", "equipmentType": "G1", "displayMeasurements": ["TH-101", "PW-101"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 90, "y": 1170}, "selected": false, "positionAbsolute": {"x": 90, "y": 1170}}, {"id": "D1_1751083531907", "data": {"icon": "wind", "label": "압축기", "status": "STOP", "equipmentCode": "D101", "equipmentName": "압축기", "equipmentType": "D1", "displayMeasurements": ["PC-101", "TC-101"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 400, "y": 1170}, "selected": false, "positionAbsolute": {"x": 400, "y": 1170}}, {"id": "COMMON_1751546846753", "data": {"icon": "settings", "label": "공통설비", "status": "STOP", "equipmentCode": "", "equipmentName": "공통설비", "equipmentType": "COMMON", "displayMeasurements": []}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "position": {"x": -765, "y": 165}}, {"id": "text_1751547256763", "data": {"text": "Text", "color": "#000000", "fontSize": 14}, "type": "text", "width": 50, "height": 37, "position": {"x": -225, "y": 0}}]}', '샘플 공정도 - Version 2025. 7. 3. 오후 10:08:01', 'Saved from editor at 2025. 7. 3. 오후 10:08:01', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-03 22:08:01.124376+09', false, NULL, NULL, NULL, 'USER', 'PRIVATE', false);
INSERT INTO public.personal_test_process_flow_versions (id, flow_id, version_number, flow_data, name, description, created_by, created_at, is_published, published_at, publish_token, data_source_id, scope_type, visibility_scope, shared_with_workspace) VALUES ('8e66b662-8348-419f-8438-55e5c85efed2', '44254471-ea40-4866-9330-6012406e8cff', 1, '{"edges": [{"id": "reactflow__edge-COMMON_1752036246531-COMMON_1752036259739", "data": {"type": "step"}, "type": "step", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1752036246531", "target": "COMMON_1752036259739", "animated": false, "sourceHandle": null, "targetHandle": null}], "nodes": [{"id": "COMMON_1752036246531", "data": {"icon": "settings", "label": "Primary Heat Exchanger", "status": "STOP", "equipmentCode": "HEATEX-01", "equipmentName": "Primary Heat Exchanger", "equipmentType": "HeatExchanger", "displayMeasurements": ["HOUR-C01", "LOAD-C01", "FREQ-G01"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 765, "y": 120}, "selected": false, "positionAbsolute": {"x": 765, "y": 120}}, {"id": "COMMON_1752036259739", "data": {"icon": "settings", "label": "Tank Level Sensor", "status": "STOP", "equipmentCode": "SENSOR-L-01", "equipmentName": "Tank Level Sensor", "equipmentType": "Sensor", "displayMeasurements": ["P-C01-OUT", "T-004-MOT", "PRES-S01"]}, "type": "equipment", "style": {"width": 200, "height": 270}, "width": 200, "height": 270, "dragging": false, "position": {"x": 1080, "y": 90}, "selected": true, "positionAbsolute": {"x": 1080, "y": 90}}]}', 'nt - Version 2025. 7. 9. 오후 3:01:54', 'Saved from editor at 2025. 7. 9. 오후 3:01:54', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-09 15:01:55.354563+09', true, '2025-07-09 15:16:48.055346+09', 'zK62ELnYQtkw7lm4yoQAjk94DzdfACWhhGR-db86oto', NULL, 'USER', 'PRIVATE', false);
INSERT INTO public.personal_test_process_flow_versions (id, flow_id, version_number, flow_data, name, description, created_by, created_at, is_published, published_at, publish_token, data_source_id, scope_type, visibility_scope, shared_with_workspace) VALUES ('99d83a87-744a-4817-90d5-bd7eec2e7923', 'e0c49961-d132-46a6-8069-91dd4ef5eb62', 1, '{"edges": [{"id": "reactflow__edge-COMMON_1752539425575-COMMON_1752539826999", "data": {"type": "straight"}, "type": "straight", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1752539425575", "target": "COMMON_1752539826999", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-COMMON_1752539794270-COMMON_1752539838935", "data": {"type": "step"}, "type": "step", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1752539794270", "target": "COMMON_1752539838935", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-COMMON_1752539826999-COMMON_1752539794270", "data": {"type": "smoothstep"}, "type": "smoothstep", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1752539826999", "target": "COMMON_1752539794270", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-COMMON_1752539838935-COMMON_1752539805670", "data": {"type": "default"}, "type": "default", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1752539838935", "target": "COMMON_1752539805670", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-COMMON_1752539805670-COMMON_1752539870718", "data": {"type": "default"}, "type": "default", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1752539805670", "target": "COMMON_1752539870718", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-COMMON_1752539870718-COMMON_1752539885190", "data": {"type": "step"}, "type": "step", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1752539870718", "target": "COMMON_1752539885190", "animated": false, "sourceHandle": null, "targetHandle": null}], "nodes": [{"id": "COMMON_1752539425575", "data": {"icon": "settings", "label": "Main Conveyor Belt", "status": "STOP", "nodeSize": "3", "equipmentCode": "CONV-01", "equipmentName": "Main Conveyor Belt", "equipmentType": "Conveyor", "displayMeasurements": ["P-C01-OUT", "T-C01-OUT", "HOUR-C01", "P-C02-OUT"]}, "type": "equipment", "style": {"width": 200, "height": 270}, "width": 200, "height": 270, "dragging": false, "position": {"x": -210, "y": -15}, "resizing": false, "selected": false, "positionAbsolute": {"x": -210, "y": -15}}, {"id": "COMMON_1752539794270", "data": {"icon": "settings", "label": "Emergency Diesel Generator", "status": "STOP", "nodeSize": "3", "equipmentCode": "GENERATOR-01", "equipmentName": "Emergency Diesel Generator", "equipmentType": "Generator", "displayMeasurements": ["HOUR-C01", "T-C01-OUT", "SPD-C01", "LOAD-C01", "TORQUE-C01", "VIB-F01"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 570, "y": 15}, "selected": false, "positionAbsolute": {"x": 570, "y": 15}}, {"id": "COMMON_1752539805670", "data": {"icon": "settings", "label": "Air Compressor Unit 2", "status": "STOP", "nodeSize": "3", "equipmentCode": "COMP-002", "equipmentName": "Air Compressor Unit 2", "equipmentType": "Compressor", "displayMeasurements": ["HOUR-C01", "T-C01-OUT", "LOAD-C01", "P-C03-OUT"]}, "type": "equipment", "style": {"width": 200, "height": 270}, "width": 200, "height": 270, "dragging": false, "position": {"x": 855, "y": 0}, "selected": false, "positionAbsolute": {"x": 855, "y": 0}}, {"id": "COMMON_1752539826999", "data": {"icon": "settings", "label": "Reactor Temp Sensor", "status": "STOP", "nodeSize": "3", "equipmentCode": "SENSOR-T-01", "equipmentName": "Reactor Temp Sensor", "equipmentType": "Sensor", "displayMeasurements": ["HOUR-C01"]}, "type": "equipment", "style": {"width": 200, "height": 255}, "width": 200, "height": 255, "dragging": false, "position": {"x": 0, "y": 300}, "resizing": false, "selected": false, "positionAbsolute": {"x": 0, "y": 300}}, {"id": "COMMON_1752539838935", "data": {"icon": "settings", "label": "Emergency Diesel Generator", "status": "STOP", "nodeSize": "3", "equipmentCode": "GENERATOR-01", "equipmentName": "Emergency Diesel Generator", "equipmentType": "Generator", "displayMeasurements": ["T-C01-OUT", "LOAD-C01", "FLOW-F01", "DP-H02", "HUMID-HVAC", "A-002-CUR", "RUNTIME-M04", "P-002-DIS", "PRES-P05", "POS-R02-X", "DP-101", "TEMP-T01", "POS-301"]}, "type": "equipment", "style": {"width": 215, "height": 860}, "width": 215, "height": 860, "dragging": false, "position": {"x": 600, "y": 360}, "resizing": false, "selected": false, "positionAbsolute": {"x": 600, "y": 360}}, {"id": "COMMON_1752539870718", "data": {"icon": "settings", "label": "Main Conveyor Belt", "status": "STOP", "nodeSize": "3", "equipmentCode": "CONV-01", "equipmentName": "Main Conveyor Belt", "equipmentType": "Conveyor", "displayMeasurements": ["P-C01-OUT", "T-C01-OUT", "LOAD-C01", "DP-F01"]}, "type": "equipment", "style": {"width": 545, "height": 120}, "width": 545, "height": 120, "dragging": false, "position": {"x": 855, "y": 345}, "resizing": false, "selected": false, "positionAbsolute": {"x": 855, "y": 345}}, {"id": "COMMON_1752539885190", "data": {"icon": "settings", "label": "Acid Storage Tank", "status": "STOP", "nodeSize": "3", "equipmentCode": "TANK-CHEM-01", "equipmentName": "Acid Storage Tank", "equipmentType": "Tank", "displayMeasurements": ["HOUR-C01", "T-C01-OUT", "T-C02-OUT", "SPD-C01", "VOLT-G01", "T-H02-OUT", "S-001-RPM", "RUNTIME-M04"]}, "type": "equipment", "style": {"width": 575, "height": 315}, "width": 575, "height": 315, "dragging": false, "position": {"x": 885, "y": 630}, "resizing": false, "selected": true, "positionAbsolute": {"x": 885, "y": 630}}, {"id": "text_1752539902086", "data": {"text": "너는 노드야.", "color": "#000000", "padding": 8, "fontSize": 100, "textAlign": "center", "fontWeight": "normal", "borderColor": "#999999", "borderStyle": "none", "borderWidth": 1, "backgroundColor": "#ffffff"}, "type": "text", "width": 573, "height": 166, "dragging": false, "position": {"x": -450, "y": 600}, "selected": false, "positionAbsolute": {"x": -450, "y": 600}}, {"id": "group_1752539919102", "data": {"color": "#6b7280", "label": "Group", "zIndex": -10, "titleSize": 14, "titleColor": "#374151", "borderStyle": "dashed", "titlePosition": "top", "backgroundColor": "#6b7280", "backgroundOpacity": 10}, "type": "group", "style": {"width": 300, "height": 200}, "width": 300, "height": 200, "dragging": false, "position": {"x": 255, "y": 645}, "selected": false, "positionAbsolute": {"x": 255, "y": 645}}], "nodeSize": "3"}', 'aaaaaa0715 - Version 2025. 7. 15. 오전 10:00:04', 'Saved from editor at 2025. 7. 15. 오전 10:00:04', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-15 10:00:04.346282+09', false, NULL, NULL, NULL, 'USER', 'PRIVATE', false);
INSERT INTO public.personal_test_process_flow_versions (id, flow_id, version_number, flow_data, name, description, created_by, created_at, is_published, published_at, publish_token, data_source_id, scope_type, visibility_scope, shared_with_workspace) VALUES ('7e39cbc8-543f-49b7-85f2-73077a9b3ee9', 'f3f3a3de-4f01-4536-9bb6-6f05c9f52ec3', 2, '{"edges": [{"id": "reactflow__edge-COMMON_1752542183430-COMMON_1752542185262", "data": {"type": "step"}, "type": "step", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1752542183430", "target": "COMMON_1752542185262", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-COMMON_1752542185262-COMMON_1752542967597", "data": {"type": "step"}, "type": "step", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1752542185262", "target": "COMMON_1752542967597", "animated": false, "sourceHandle": null, "targetHandle": null}], "nodes": [{"id": "COMMON_1752542183430", "data": {"icon": "settings", "label": "Main Exhaust Fan", "status": "STOP", "nodeSize": "3", "equipmentCode": "FAN-EX-01", "equipmentName": "Main Exhaust Fan", "equipmentType": "Fan", "displayMeasurements": ["HOUR-C01", "T-C01-OUT"]}, "type": "equipment", "style": {"width": 200, "height": 270}, "width": 200, "height": 270, "dragging": false, "position": {"x": 240, "y": 75}, "resizing": false, "selected": false, "positionAbsolute": {"x": 240, "y": 75}}, {"id": "COMMON_1752542185262", "data": {"icon": "settings", "label": "Welding Robot Arm 1", "status": "STOP", "nodeSize": "3", "equipmentCode": "ROBOT-A-01", "equipmentName": "Welding Robot Arm 1", "equipmentType": "Robot", "displayMeasurements": ["HOUR-C01", "T-C01-OUT", "P-C02-OUT", "P-C03-OUT", "TORQUE-C01", "FLOW-F01", "T-H01-IN", "EFF-H02", "T-HVAC-RET", "S-002-RPM", "P-001-DIS", "P-002-SUC", "T-004-MOT", "PWR-R01"]}, "type": "equipment", "style": {"width": 545, "height": 270}, "width": 545, "height": 270, "dragging": false, "position": {"x": 825, "y": -135}, "resizing": false, "selected": true, "positionAbsolute": {"x": 825, "y": -135}}, {"id": "COMMON_1752542967597", "data": {"icon": "settings", "label": "Main Exhaust Fan", "status": "STOP", "nodeSize": "3", "equipmentCode": "FAN-EX-01", "equipmentName": "Main Exhaust Fan", "equipmentType": "Fan", "displayMeasurements": ["P-C01-OUT", "FLOW-F01", "DP-F01", "T-H01-OUT", "FILTER-DP", "S-001-RPM", "LOAD-M04"]}, "type": "equipment", "style": {"width": 200, "height": 495}, "width": 200, "height": 495, "dragging": false, "position": {"x": 840, "y": 195}, "resizing": false, "selected": false, "positionAbsolute": {"x": 840, "y": 195}}], "nodeSize": "3"}', 'ccccccc0715 - Version 2025. 7. 15. 오전 11:27:35', 'Saved from editor at 2025. 7. 15. 오전 11:27:35', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-15 11:27:35.869582+09', false, NULL, NULL, NULL, 'USER', 'PRIVATE', false);
INSERT INTO public.personal_test_process_flow_versions (id, flow_id, version_number, flow_data, name, description, created_by, created_at, is_published, published_at, publish_token, data_source_id, scope_type, visibility_scope, shared_with_workspace) VALUES ('e8356855-77d7-4dd2-9ef6-47e0f3e0ff00', 'f3f3a3de-4f01-4536-9bb6-6f05c9f52ec3', 3, '{"edges": [{"id": "reactflow__edge-COMMON_1752542183430-COMMON_1752542185262", "data": {"type": "step"}, "type": "step", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1752542183430", "target": "COMMON_1752542185262", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-COMMON_1752542185262-COMMON_1752542967597", "data": {"type": "step"}, "type": "step", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1752542185262", "target": "COMMON_1752542967597", "animated": false, "sourceHandle": null, "targetHandle": null}], "nodes": [{"id": "COMMON_1752542183430", "data": {"icon": "settings", "label": "Main Exhaust Fan", "status": "STOP", "nodeSize": "3", "equipmentCode": "FAN-EX-01", "equipmentName": "Main Exhaust Fan", "equipmentType": "Fan", "displayMeasurements": ["HOUR-C01", "T-C01-OUT"]}, "type": "equipment", "style": {"width": 200, "height": 270}, "width": 200, "height": 270, "dragging": false, "position": {"x": 240, "y": 75}, "resizing": false, "selected": false, "positionAbsolute": {"x": 240, "y": 75}}, {"id": "COMMON_1752542185262", "data": {"icon": "settings", "label": "Welding Robot Arm 1", "status": "STOP", "nodeSize": "3", "equipmentCode": "ROBOT-A-01", "equipmentName": "Welding Robot Arm 1", "equipmentType": "Robot", "displayMeasurements": ["HOUR-C01", "T-C01-OUT", "P-C02-OUT", "P-C03-OUT", "TORQUE-C01", "FLOW-F01", "T-H01-IN", "EFF-H02", "T-HVAC-RET", "S-002-RPM", "P-001-DIS", "P-002-SUC", "T-004-MOT", "PWR-R01"]}, "type": "equipment", "style": {"width": 545, "height": 270}, "width": 545, "height": 270, "dragging": false, "position": {"x": 825, "y": -135}, "resizing": false, "selected": true, "positionAbsolute": {"x": 825, "y": -135}}, {"id": "COMMON_1752542967597", "data": {"icon": "settings", "label": "Main Exhaust Fan", "status": "STOP", "nodeSize": "3", "equipmentCode": "FAN-EX-01", "equipmentName": "Main Exhaust Fan", "equipmentType": "Fan", "displayMeasurements": ["P-C01-OUT", "FLOW-F01", "DP-F01", "T-H01-OUT", "FILTER-DP", "S-001-RPM", "LOAD-M04"]}, "type": "equipment", "style": {"width": 200, "height": 495}, "width": 200, "height": 495, "dragging": false, "position": {"x": 840, "y": 195}, "resizing": false, "selected": false, "positionAbsolute": {"x": 840, "y": 195}}], "nodeSize": "3"}', 'ccccccc0715 - Version 2025. 7. 15. 오전 11:30:35', 'Saved from editor at 2025. 7. 15. 오전 11:30:35', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-15 11:30:35.930513+09', false, NULL, NULL, NULL, 'USER', 'PRIVATE', false);
INSERT INTO public.personal_test_process_flow_versions (id, flow_id, version_number, flow_data, name, description, created_by, created_at, is_published, published_at, publish_token, data_source_id, scope_type, visibility_scope, shared_with_workspace) VALUES ('b23f8173-2b3d-42b1-8566-2e0e767f68cb', 'f3f3a3de-4f01-4536-9bb6-6f05c9f52ec3', 1, '{"edges": [{"id": "reactflow__edge-COMMON_1752542183430-COMMON_1752542185262", "data": {"type": "step"}, "type": "step", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1752542183430", "target": "COMMON_1752542185262", "animated": false, "sourceHandle": null, "targetHandle": null}], "nodes": [{"id": "COMMON_1752542183430", "data": {"icon": "settings", "label": "Main Exhaust Fan", "status": "STOP", "nodeSize": "1", "equipmentCode": "FAN-EX-01", "equipmentName": "Main Exhaust Fan", "equipmentType": "Fan", "displayMeasurements": ["HOUR-C01", "T-C01-OUT"]}, "type": "equipment", "style": {"width": 350, "height": 170}, "width": 350, "height": 170, "dragging": false, "position": {"x": 360, "y": 105}, "resizing": false, "selected": false, "positionAbsolute": {"x": 360, "y": 105}}, {"id": "COMMON_1752542185262", "data": {"icon": "settings", "label": "Welding Robot Arm 1", "status": "STOP", "nodeSize": "3", "equipmentCode": "ROBOT-A-01", "equipmentName": "Welding Robot Arm 1", "equipmentType": "Robot", "displayMeasurements": ["HOUR-C01", "T-C01-OUT", "P-C02-OUT", "P-C03-OUT"]}, "type": "equipment", "style": {"width": 260, "height": 360}, "width": 260, "height": 360, "dragging": false, "position": {"x": 870, "y": 105}, "resizing": false, "selected": true, "positionAbsolute": {"x": 870, "y": 105}}], "nodeSize": "3"}', 'ccccccc0715 - Version 2025. 7. 15. 오전 10:27:43', 'Saved from editor at 2025. 7. 15. 오전 10:27:43', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-15 10:27:43.588285+09', false, NULL, NULL, NULL, 'USER', 'PRIVATE', false);
INSERT INTO public.personal_test_process_flow_versions (id, flow_id, version_number, flow_data, name, description, created_by, created_at, is_published, published_at, publish_token, data_source_id, scope_type, visibility_scope, shared_with_workspace) VALUES ('14ad81dc-6539-48db-a1fa-dcb6ec0fa18c', 'f3f3a3de-4f01-4536-9bb6-6f05c9f52ec3', 4, '{"edges": [{"id": "reactflow__edge-COMMON_1752542183430-COMMON_1752542185262", "data": {"type": "step"}, "type": "step", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1752542183430", "target": "COMMON_1752542185262", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-COMMON_1752542185262-COMMON_1752542967597", "data": {"type": "step"}, "type": "step", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1752542185262", "target": "COMMON_1752542967597", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-COMMON_1752542967597-COMMON_1752546670764", "data": {"type": "smoothstep"}, "type": "smoothstep", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1752542967597", "target": "COMMON_1752546670764", "animated": false, "sourceHandle": null, "targetHandle": null}], "nodes": [{"id": "COMMON_1752542183430", "data": {"icon": "settings", "label": "Main Exhaust Fan", "status": "STOP", "nodeSize": "3", "equipmentCode": "FAN-EX-01", "equipmentName": "Main Exhaust Fan", "equipmentType": "Fan", "displayMeasurements": ["HOUR-C01", "T-C01-OUT"]}, "type": "equipment", "style": {"width": 200, "height": 270}, "width": 200, "height": 270, "dragging": false, "position": {"x": 240, "y": 75}, "resizing": false, "selected": false, "positionAbsolute": {"x": 240, "y": 75}}, {"id": "COMMON_1752542185262", "data": {"icon": "settings", "label": "Welding Robot Arm 1", "status": "STOP", "nodeSize": "3", "equipmentCode": "ROBOT-A-01", "equipmentName": "Welding Robot Arm 1", "equipmentType": "Robot", "displayMeasurements": ["HOUR-C01", "T-C01-OUT", "P-C02-OUT", "P-C03-OUT", "TORQUE-C01", "FLOW-F01", "T-H01-IN", "EFF-H02", "T-HVAC-RET", "S-002-RPM", "P-001-DIS", "P-002-SUC", "T-004-MOT", "PWR-R01"]}, "type": "equipment", "style": {"width": 545, "height": 270}, "width": 545, "height": 270, "dragging": false, "position": {"x": 825, "y": -135}, "resizing": false, "selected": false, "positionAbsolute": {"x": 825, "y": -135}}, {"id": "COMMON_1752542967597", "data": {"icon": "settings", "label": "Main Exhaust Fan", "status": "STOP", "nodeSize": "3", "equipmentCode": "FAN-EX-01", "equipmentName": "Main Exhaust Fan", "equipmentType": "Fan", "displayMeasurements": ["P-C01-OUT", "FLOW-F01", "DP-F01", "T-H01-OUT", "FILTER-DP", "S-001-RPM", "LOAD-M04"]}, "type": "equipment", "style": {"width": 200, "height": 495}, "width": 200, "height": 495, "dragging": false, "position": {"x": 840, "y": 195}, "resizing": false, "selected": false, "positionAbsolute": {"x": 840, "y": 195}}, {"id": "COMMON_1752546670764", "data": {"icon": "settings", "label": "Slurry Transfer Pump", "status": "STOP", "nodeSize": "1", "equipmentCode": "PUMP-004", "equipmentName": "Slurry Transfer Pump", "equipmentType": "Pump", "displayMeasurements": ["P-C01-OUT", "LOAD-C01", "T-H02-OUT", "S-001-RPM"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 1335, "y": 195}, "selected": true, "positionAbsolute": {"x": 1335, "y": 195}}], "nodeSize": "3"}', 'ccccccc0715 - Version 2025. 7. 15. 오전 11:31:30', 'Saved from editor at 2025. 7. 15. 오전 11:31:30', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-15 11:31:30.270271+09', true, '2025-07-15 11:31:39.816054+09', 'ErktoXoORhIwrxP4dJSln3Oa--edQ_9NuWWLhzUx6Hk', NULL, 'USER', 'PRIVATE', false);
INSERT INTO public.personal_test_process_flow_versions (id, flow_id, version_number, flow_data, name, description, created_by, created_at, is_published, published_at, publish_token, data_source_id, scope_type, visibility_scope, shared_with_workspace) VALUES ('f5d27da0-900e-44e0-a37f-87899c338982', 'f3f3a3de-4f01-4536-9bb6-6f05c9f52ec3', 5, '{"edges": [{"id": "reactflow__edge-COMMON_1752542183430-COMMON_1752542185262", "data": {"type": "step"}, "type": "step", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1752542183430", "target": "COMMON_1752542185262", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-COMMON_1752542185262-COMMON_1752542967597", "data": {"type": "step"}, "type": "step", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1752542185262", "target": "COMMON_1752542967597", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-COMMON_1752542967597-COMMON_1752546670764", "data": {"type": "smoothstep"}, "type": "smoothstep", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1752542967597", "target": "COMMON_1752546670764", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-COMMON_1752546670764-COMMON_1752546809100", "data": {"type": "step"}, "type": "step", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1752546670764", "target": "COMMON_1752546809100", "animated": false, "sourceHandle": null, "targetHandle": null}], "nodes": [{"id": "COMMON_1752542183430", "data": {"icon": "settings", "label": "Main Exhaust Fan", "status": "STOP", "nodeSize": "3", "equipmentCode": "FAN-EX-01", "equipmentName": "Main Exhaust Fan", "equipmentType": "Fan", "displayMeasurements": ["HOUR-C01", "T-C01-OUT"]}, "type": "equipment", "style": {"width": 200, "height": 270}, "width": 200, "height": 270, "dragging": false, "position": {"x": 240, "y": 75}, "resizing": false, "selected": false, "positionAbsolute": {"x": 240, "y": 75}}, {"id": "COMMON_1752542185262", "data": {"icon": "settings", "label": "Welding Robot Arm 1", "status": "STOP", "nodeSize": "3", "equipmentCode": "ROBOT-A-01", "equipmentName": "Welding Robot Arm 1", "equipmentType": "Robot", "displayMeasurements": ["HOUR-C01", "T-C01-OUT", "P-C02-OUT", "P-C03-OUT", "TORQUE-C01", "FLOW-F01", "T-H01-IN", "EFF-H02", "T-HVAC-RET", "S-002-RPM", "P-001-DIS", "P-002-SUC", "T-004-MOT", "PWR-R01"]}, "type": "equipment", "style": {"width": 545, "height": 270}, "width": 545, "height": 270, "dragging": false, "position": {"x": 825, "y": -135}, "resizing": false, "selected": false, "positionAbsolute": {"x": 825, "y": -135}}, {"id": "COMMON_1752542967597", "data": {"icon": "settings", "label": "Main Exhaust Fan", "status": "STOP", "nodeSize": "3", "equipmentCode": "FAN-EX-01", "equipmentName": "Main Exhaust Fan", "equipmentType": "Fan", "displayMeasurements": ["P-C01-OUT", "FLOW-F01", "DP-F01", "T-H01-OUT", "FILTER-DP", "S-001-RPM", "LOAD-M04"]}, "type": "equipment", "style": {"width": 200, "height": 495}, "width": 200, "height": 495, "dragging": false, "position": {"x": 840, "y": 195}, "resizing": false, "selected": false, "positionAbsolute": {"x": 840, "y": 195}}, {"id": "COMMON_1752546670764", "data": {"icon": "settings", "label": "Slurry Transfer Pump", "status": "STOP", "nodeSize": "3", "equipmentCode": "PUMP-004", "equipmentName": "Slurry Transfer Pump", "equipmentType": "Pump", "displayMeasurements": ["P-C01-OUT", "LOAD-C01", "T-H02-OUT", "S-001-RPM"]}, "type": "equipment", "style": {"width": 200, "height": 270}, "width": 200, "height": 270, "dragging": false, "position": {"x": 1335, "y": 195}, "selected": false, "positionAbsolute": {"x": 1335, "y": 195}}, {"id": "COMMON_1752546809100", "data": {"icon": "settings", "label": "Slurry Transfer Pump", "status": "STOP", "nodeSize": "1", "equipmentCode": "PUMP-004", "equipmentName": "Slurry Transfer Pump", "equipmentType": "Pump", "displayMeasurements": ["P-C01-OUT", "T-C01-OUT"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 1335, "y": 570}, "selected": true, "positionAbsolute": {"x": 1335, "y": 570}}], "nodeSize": "3"}', 'ccccccc0715 - Version 2025. 7. 15. 오전 11:33:43', 'Saved from editor at 2025. 7. 15. 오전 11:33:43', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-15 11:33:43.799929+09', false, NULL, NULL, NULL, 'USER', 'PRIVATE', false);
INSERT INTO public.personal_test_process_flow_versions (id, flow_id, version_number, flow_data, name, description, created_by, created_at, is_published, published_at, publish_token, data_source_id, scope_type, visibility_scope, shared_with_workspace) VALUES ('3ac696a4-9b8b-4d77-99d8-85368950eb0b', 'af88e399-fe56-495f-8289-7c22c26a5dcb', 1, '{"edges": [], "nodes": [{"id": "COMMON_1753777474814", "data": {"icon": "settings", "label": "Emergency Diesel Generator", "status": "STOP", "nodeSize": "1", "equipmentCode": "GENERATOR-01", "equipmentName": "Emergency Diesel Generator", "equipmentType": "Generator", "displayMeasurements": []}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 420, "y": 135}, "selected": false, "positionAbsolute": {"x": 420, "y": 135}}, {"id": "instrument_1753777475598", "data": {"color": "#6b7280", "label": "계측기", "nodeSize": "1", "measurements": [], "instrumentName": "계측기", "instrumentType": "I1", "displayMeasurements": ["P-C01-OUT", "P-C02-OUT"]}, "type": "instrument", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 720, "y": 120}, "selected": false, "positionAbsolute": {"x": 720, "y": 120}}], "nodeSize": "1"}', 'New Process Flow - Version 2025. 7. 29. 오후 5:25:15', 'Saved from editor at 2025. 7. 29. 오후 5:25:15', 'd65db892-9691-46e3-a2c6-d962980f2f51', '2025-07-29 17:25:15.920869+09', false, NULL, NULL, NULL, 'USER', 'PRIVATE', false);
INSERT INTO public.personal_test_process_flow_versions (id, flow_id, version_number, flow_data, name, description, created_by, created_at, is_published, published_at, publish_token, data_source_id, scope_type, visibility_scope, shared_with_workspace) VALUES ('72a6f82f-5699-4673-a91d-48faa483377a', 'af88e399-fe56-495f-8289-7c22c26a5dcb', 2, '{"edges": [], "nodes": [{"id": "COMMON_1753777474814", "data": {"icon": "settings", "label": "Emergency Diesel Generator", "status": "STOP", "nodeSize": "1", "equipmentCode": "GENERATOR-01", "equipmentName": "Emergency Diesel Generator", "equipmentType": "Generator", "displayMeasurements": []}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 420, "y": 135}, "selected": false, "positionAbsolute": {"x": 420, "y": 135}}, {"id": "instrument_1753777475598", "data": {"color": "#6b7280", "label": "계측기", "nodeSize": "1", "measurements": [], "instrumentName": "계측기", "instrumentType": "I1", "displayMeasurements": ["P-C01-OUT", "P-C02-OUT"]}, "type": "instrument", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 720, "y": 120}, "selected": false, "positionAbsolute": {"x": 720, "y": 120}}], "nodeSize": "1"}', 'New Process Flow - Version 2025. 7. 29. 오후 5:25:15', 'Saved from editor at 2025. 7. 29. 오후 5:25:15', 'd65db892-9691-46e3-a2c6-d962980f2f51', '2025-07-29 17:25:16.991868+09', false, NULL, NULL, NULL, 'USER', 'PRIVATE', false);
INSERT INTO public.personal_test_process_flow_versions (id, flow_id, version_number, flow_data, name, description, created_by, created_at, is_published, published_at, publish_token, data_source_id, scope_type, visibility_scope, shared_with_workspace) VALUES ('59b347e0-db76-4ca3-a59f-232efe2430df', 'af88e399-fe56-495f-8289-7c22c26a5dcb', 3, '{"edges": [], "nodes": [{"id": "COMMON_1753777474814", "data": {"icon": "settings", "label": "Emergency Diesel Generator", "status": "STOP", "nodeSize": "1", "equipmentCode": "GENERATOR-01", "equipmentName": "Emergency Diesel Generator", "equipmentType": "Generator", "displayMeasurements": []}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 420, "y": 135}, "selected": false, "positionAbsolute": {"x": 420, "y": 135}}, {"id": "instrument_1753777475598", "data": {"color": "#6b7280", "label": "계측기", "nodeSize": "1", "measurements": [], "instrumentName": "계측기", "instrumentType": "I1", "displayMeasurements": ["P-C01-OUT", "P-C02-OUT"]}, "type": "instrument", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 720, "y": 120}, "selected": false, "positionAbsolute": {"x": 720, "y": 120}}], "nodeSize": "1"}', 'New Process Flow - Version 2025. 7. 29. 오후 5:25:15', 'Saved from editor at 2025. 7. 29. 오후 5:25:15', 'd65db892-9691-46e3-a2c6-d962980f2f51', '2025-07-29 17:25:19.056426+09', false, NULL, NULL, NULL, 'USER', 'PRIVATE', false);
INSERT INTO public.personal_test_process_flow_versions (id, flow_id, version_number, flow_data, name, description, created_by, created_at, is_published, published_at, publish_token, data_source_id, scope_type, visibility_scope, shared_with_workspace) VALUES ('c378a2a1-d7eb-4afa-b06a-bc4ec419d333', 'af88e399-fe56-495f-8289-7c22c26a5dcb', 4, '{"edges": [], "nodes": [{"id": "COMMON_1753777474814", "data": {"icon": "settings", "label": "Emergency Diesel Generator", "status": "STOP", "nodeSize": "1", "equipmentCode": "GENERATOR-01", "equipmentName": "Emergency Diesel Generator", "equipmentType": "Generator", "displayMeasurements": []}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 420, "y": 135}, "selected": false, "positionAbsolute": {"x": 420, "y": 135}}, {"id": "instrument_1753777475598", "data": {"color": "#6b7280", "label": "계측기", "nodeSize": "1", "measurements": [], "instrumentName": "계측기", "instrumentType": "I1", "displayMeasurements": ["P-C01-OUT", "P-C02-OUT"]}, "type": "instrument", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 720, "y": 120}, "selected": false, "positionAbsolute": {"x": 720, "y": 120}}], "nodeSize": "1"}', 'New Process Flow - Version 2025. 7. 30. 오전 10:59:33', 'Saved from editor at 2025. 7. 30. 오전 10:59:33', 'd65db892-9691-46e3-a2c6-d962980f2f51', '2025-07-30 10:59:33.62018+09', false, NULL, NULL, NULL, 'USER', 'PRIVATE', false);
INSERT INTO public.personal_test_process_flow_versions (id, flow_id, version_number, flow_data, name, description, created_by, created_at, is_published, published_at, publish_token, data_source_id, scope_type, visibility_scope, shared_with_workspace) VALUES ('413d3691-e0ba-4f83-8e5c-80e2d0e88666', 'af88e399-fe56-495f-8289-7c22c26a5dcb', 5, '{"edges": [], "nodes": [{"id": "COMMON_1753777474814", "data": {"icon": "settings", "label": "Emergency Diesel Generator", "status": "STOP", "nodeSize": "1", "equipmentCode": "GENERATOR-01", "equipmentName": "Emergency Diesel Generator", "equipmentType": "Generator", "displayMeasurements": []}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 420, "y": 135}, "selected": false, "positionAbsolute": {"x": 420, "y": 135}}, {"id": "instrument_1753777475598", "data": {"color": "#6b7280", "label": "계측기", "nodeSize": "1", "measurements": [], "instrumentName": "계측기", "instrumentType": "I1", "displayMeasurements": ["P-C01-OUT", "P-C02-OUT"]}, "type": "instrument", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 720, "y": 120}, "selected": false, "positionAbsolute": {"x": 720, "y": 120}}], "nodeSize": "1"}', 'New Process Flow - Version 2025. 7. 30. 오전 10:59:33', 'Saved from editor at 2025. 7. 30. 오전 10:59:33', 'd65db892-9691-46e3-a2c6-d962980f2f51', '2025-07-30 10:59:34.709262+09', false, NULL, NULL, NULL, 'USER', 'PRIVATE', false);
INSERT INTO public.personal_test_process_flow_versions (id, flow_id, version_number, flow_data, name, description, created_by, created_at, is_published, published_at, publish_token, data_source_id, scope_type, visibility_scope, shared_with_workspace) VALUES ('127b9b45-a90d-4215-98be-1b661d778d40', 'af88e399-fe56-495f-8289-7c22c26a5dcb', 6, '{"edges": [], "nodes": [{"id": "COMMON_1753777474814", "data": {"icon": "settings", "label": "Emergency Diesel Generator", "status": "STOP", "nodeSize": "1", "equipmentCode": "GENERATOR-01", "equipmentName": "Emergency Diesel Generator", "equipmentType": "Generator", "displayMeasurements": []}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 420, "y": 135}, "selected": false, "positionAbsolute": {"x": 420, "y": 135}}, {"id": "instrument_1753777475598", "data": {"color": "#6b7280", "label": "계측기", "nodeSize": "1", "measurements": [], "instrumentName": "계측기", "instrumentType": "I1", "displayMeasurements": ["P-C01-OUT", "P-C02-OUT"]}, "type": "instrument", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 720, "y": 120}, "selected": false, "positionAbsolute": {"x": 720, "y": 120}}], "nodeSize": "1"}', 'New Process Flow - Version 2025. 7. 30. 오전 10:59:33', 'Saved from editor at 2025. 7. 30. 오전 10:59:33', 'd65db892-9691-46e3-a2c6-d962980f2f51', '2025-07-30 10:59:37.081072+09', false, NULL, NULL, NULL, 'USER', 'PRIVATE', false);
INSERT INTO public.personal_test_process_flow_versions (id, flow_id, version_number, flow_data, name, description, created_by, created_at, is_published, published_at, publish_token, data_source_id, scope_type, visibility_scope, shared_with_workspace) VALUES ('c88e8332-634c-42e7-8965-cf440d47ba6b', 'af88e399-fe56-495f-8289-7c22c26a5dcb', 7, '{"edges": [], "nodes": [{"id": "COMMON_1753777474814", "data": {"icon": "settings", "label": "Emergency Diesel Generator", "status": "STOP", "nodeSize": "1", "equipmentCode": "GENERATOR-01", "equipmentName": "Emergency Diesel Generator", "equipmentType": "Generator", "displayMeasurements": []}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 420, "y": 135}, "selected": false, "positionAbsolute": {"x": 420, "y": 135}}, {"id": "instrument_1753777475598", "data": {"color": "#6b7280", "label": "계측기", "nodeSize": "1", "measurements": [], "instrumentName": "계측기", "instrumentType": "I1", "displayMeasurements": ["P-C01-OUT", "P-C02-OUT"]}, "type": "instrument", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 720, "y": 120}, "selected": false, "positionAbsolute": {"x": 720, "y": 120}}], "nodeSize": "1"}', 'New Process Flow - Version 2025. 7. 30. 오전 10:59:33', 'Saved from editor at 2025. 7. 30. 오전 10:59:33', 'd65db892-9691-46e3-a2c6-d962980f2f51', '2025-07-30 10:59:41.132246+09', false, NULL, NULL, NULL, 'USER', 'PRIVATE', false);
INSERT INTO public.personal_test_process_flow_versions (id, flow_id, version_number, flow_data, name, description, created_by, created_at, is_published, published_at, publish_token, data_source_id, scope_type, visibility_scope, shared_with_workspace) VALUES ('476e7375-4c4b-45e9-bd03-8a8dffa34165', '90385230-33d2-4bc1-ac56-61db952c3126', 1, '{"edges": [{"id": "reactflow__edge-COMMON_1753837429272-instrument_1753837430191", "data": {"type": "step"}, "type": "step", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1753837429272", "target": "instrument_1753837430191", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-instrument_1753837430191-table_1753837448495", "data": {"type": "step"}, "type": "step", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "instrument_1753837430191", "target": "table_1753837448495", "animated": false, "sourceHandle": null, "targetHandle": null}], "nodes": [{"id": "COMMON_1753837429272", "data": {"icon": "settings", "label": "Main Exhaust Fan", "status": "STOP", "nodeSize": "1", "equipmentCode": "FAN-EX-01", "equipmentName": "Main Exhaust Fan", "equipmentType": "Fan", "displayMeasurements": ["P-C01-OUT", "P-C03-OUT", "VIB-F01", "FUEL-G01"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 570, "y": 135}, "selected": false, "positionAbsolute": {"x": 570, "y": 135}}, {"id": "instrument_1753837430191", "data": {"color": "#6b7280", "label": "계측기", "nodeSize": "1", "measurements": [], "instrumentName": "계측기", "instrumentType": "I1", "displayMeasurements": ["P-C01-OUT", "P-C03-OUT", "VIB-F01"]}, "type": "instrument", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 930, "y": 150}, "selected": false, "positionAbsolute": {"x": 930, "y": 150}}, {"id": "table_1753837448495", "data": {"color": "#3b82f6", "label": "Custom Table", "nodeSize": "2", "queryConfig": {"sql": "select *\nfrom vw_measurement_data_mock\n", "dataSourceId": "2881a01f-1eed-4343-b0d1-5d8d22f6744a", "refreshInterval": 30}, "statusRules": {"idField": "measurement_code", "lslField": "lsl", "uslField": "usl", "valueField": "measurement_value"}, "tableConfig": {"columns": [{"type": "id", "field": "measurement_code", "width": 60, "header": "ID"}, {"type": "value", "field": "measurement_value", "width": 80, "header": "Value"}, {"type": "usl", "field": "usl", "width": 60, "header": "USL"}, {"type": "lsl", "field": "lsl", "width": 60, "header": "LSL"}, {"type": "status", "field": "spec_status", "width": 80, "header": "Status"}], "maxRows": 50, "displayMode": "table"}}, "type": "table", "style": {"width": 535, "height": 450}, "width": 535, "height": 450, "dragging": false, "position": {"x": 1365, "y": 225}, "resizing": false, "selected": true, "positionAbsolute": {"x": 1365, "y": 225}}], "nodeSize": "1"}', 'xzxcxzcv - Version 2025. 7. 30. 오후 2:39:50', 'Saved from editor at 2025. 7. 30. 오후 2:39:50', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-30 14:39:50.188759+09', false, NULL, NULL, NULL, 'USER', 'PRIVATE', false);
INSERT INTO public.personal_test_process_flow_versions (id, flow_id, version_number, flow_data, name, description, created_by, created_at, is_published, published_at, publish_token, data_source_id, scope_type, visibility_scope, shared_with_workspace) VALUES ('f02b394e-2fe1-483f-867b-464d184152f5', '90385230-33d2-4bc1-ac56-61db952c3126', 2, '{"edges": [{"id": "reactflow__edge-COMMON_1753837429272-instrument_1753837430191", "data": {"type": "step"}, "type": "step", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1753837429272", "target": "instrument_1753837430191", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-instrument_1753837430191-table_1753837448495", "data": {"type": "step"}, "type": "step", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "instrument_1753837430191", "target": "table_1753837448495", "animated": false, "sourceHandle": null, "targetHandle": null}], "nodes": [{"id": "COMMON_1753837429272", "data": {"icon": "settings", "label": "Main Exhaust Fan", "status": "STOP", "nodeSize": "1", "equipmentCode": "FAN-EX-01", "equipmentName": "Main Exhaust Fan", "equipmentType": "Fan", "displayMeasurements": ["P-C01-OUT", "P-C03-OUT", "VIB-F01", "FUEL-G01"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 570, "y": 135}, "selected": false, "positionAbsolute": {"x": 570, "y": 135}}, {"id": "instrument_1753837430191", "data": {"color": "#6b7280", "label": "계측기", "nodeSize": "1", "measurements": [], "instrumentName": "계측기", "instrumentType": "I1", "displayMeasurements": ["P-C01-OUT", "P-C03-OUT", "VIB-F01"]}, "type": "instrument", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 930, "y": 150}, "selected": false, "positionAbsolute": {"x": 930, "y": 150}}, {"id": "table_1753837448495", "data": {"color": "#3b82f6", "label": "Custom Table", "nodeSize": "2", "queryConfig": {"sql": "select *\nfrom vw_measurement_data_mock\n", "dataSourceId": "2881a01f-1eed-4343-b0d1-5d8d22f6744a", "refreshInterval": 30}, "statusRules": {"idField": "measurement_code", "lslField": "lsl", "uslField": "usl", "valueField": "measurement_value"}, "tableConfig": {"columns": [{"type": "id", "field": "measurement_code", "width": 60, "header": "ID"}, {"type": "value", "field": "measurement_value", "width": 80, "header": "Value"}, {"type": "usl", "field": "usl", "width": 60, "header": "USL"}, {"type": "lsl", "field": "lsl", "width": 60, "header": "LSL"}, {"type": "status", "field": "spec_status", "width": 80, "header": "Status"}], "maxRows": 50, "displayMode": "table"}}, "type": "table", "style": {"width": 535, "height": 690}, "width": 535, "height": 690, "dragging": false, "position": {"x": 1365, "y": 225}, "resizing": false, "selected": true, "positionAbsolute": {"x": 1365, "y": 225}}], "nodeSize": "1"}', 'xzxcxzcv - Version 2025. 7. 30. 오후 2:44:55', 'Saved from editor at 2025. 7. 30. 오후 2:44:55', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-30 14:44:55.428208+09', false, NULL, NULL, NULL, 'USER', 'PRIVATE', false);
INSERT INTO public.personal_test_process_flow_versions (id, flow_id, version_number, flow_data, name, description, created_by, created_at, is_published, published_at, publish_token, data_source_id, scope_type, visibility_scope, shared_with_workspace) VALUES ('7031d580-291e-4097-a6a4-a48fb55c3f80', '90385230-33d2-4bc1-ac56-61db952c3126', 3, '{"edges": [{"id": "reactflow__edge-COMMON_1753837429272-instrument_1753837430191", "data": {"type": "step"}, "type": "step", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1753837429272", "target": "instrument_1753837430191", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-instrument_1753837430191-table_1753837448495", "data": {"type": "step"}, "type": "step", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "instrument_1753837430191", "target": "table_1753837448495", "animated": false, "sourceHandle": null, "targetHandle": null}], "nodes": [{"id": "COMMON_1753837429272", "data": {"icon": "settings", "label": "Main Exhaust Fan", "status": "STOP", "nodeSize": "1", "equipmentCode": "FAN-EX-01", "equipmentName": "Main Exhaust Fan", "equipmentType": "Fan", "displayMeasurements": ["P-C01-OUT", "P-C03-OUT", "VIB-F01", "FUEL-G01"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 570, "y": 135}, "selected": false, "positionAbsolute": {"x": 570, "y": 135}}, {"id": "instrument_1753837430191", "data": {"color": "#6b7280", "label": "계측기", "nodeSize": "1", "measurements": [], "instrumentName": "계측기", "instrumentType": "I1", "displayMeasurements": ["P-C01-OUT", "P-C03-OUT", "VIB-F01"]}, "type": "instrument", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 930, "y": 150}, "selected": false, "positionAbsolute": {"x": 930, "y": 150}}, {"id": "table_1753837448495", "data": {"color": "#3b82f6", "label": "Custom Table", "nodeSize": "2", "queryConfig": {"sql": "select *\nfrom vw_measurement_data_mock\n", "dataSourceId": "2881a01f-1eed-4343-b0d1-5d8d22f6744a", "refreshInterval": 30}, "statusRules": {"idField": "measurement_code", "lslField": "lsl", "uslField": "usl", "valueField": "measurement_value"}, "tableConfig": {"columns": [{"type": "id", "field": "measurement_code", "width": 60, "header": "ID"}, {"type": "value", "field": "measurement_value", "width": 80, "header": "Value"}, {"type": "usl", "field": "usl", "width": 60, "header": "USL"}, {"type": "lsl", "field": "lsl", "width": 60, "header": "LSL"}, {"type": "status", "field": "spec_status", "width": 80, "header": "Status"}], "maxRows": 50, "displayMode": "table"}}, "type": "table", "style": {"width": 535, "height": 690}, "width": 535, "height": 690, "dragging": false, "position": {"x": 1365, "y": 225}, "resizing": false, "selected": true, "positionAbsolute": {"x": 1365, "y": 225}}], "nodeSize": "1"}', 'xzxcxzcv - Version 2025. 7. 30. 오후 6:19:25', 'Saved from editor at 2025. 7. 30. 오후 6:19:25', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-30 18:19:25.097131+09', false, NULL, NULL, NULL, 'USER', 'PRIVATE', false);
INSERT INTO public.personal_test_process_flow_versions (id, flow_id, version_number, flow_data, name, description, created_by, created_at, is_published, published_at, publish_token, data_source_id, scope_type, visibility_scope, shared_with_workspace) VALUES ('d32e94ea-3762-4085-9773-de738bcca1fd', '84fa268b-3ffd-4e02-92bf-4b9f563f97ab', 1, '{"edges": [{"id": "reactflow__edge-COMMON_1753868418977-COMMON_1753868428074", "data": {"type": "smoothstep"}, "type": "smoothstep", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1753868418977", "target": "COMMON_1753868428074", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-COMMON_1753868428074-instrument_1753868440913", "data": {"type": "smoothstep"}, "type": "smoothstep", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1753868428074", "target": "instrument_1753868440913", "animated": false, "sourceHandle": null, "targetHandle": null}], "nodes": [{"id": "COMMON_1753868418977", "data": {"icon": "settings", "label": "Emergency Diesel Generator", "status": "STOP", "nodeSize": "1", "equipmentCode": "GENERATOR-01", "equipmentName": "Emergency Diesel Generator", "equipmentType": "Generator", "displayMeasurements": ["T-C01-OUT", "P-C01-OUT", "OIL-C03", "P-C03-OUT"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 315, "y": 15}, "selected": false, "positionAbsolute": {"x": 315, "y": 15}}, {"id": "COMMON_1753868428074", "data": {"icon": "settings", "label": "Emergency Diesel Generator", "status": "STOP", "nodeSize": "1", "equipmentCode": "GENERATOR-01", "equipmentName": "Emergency Diesel Generator", "equipmentType": "Generator", "displayMeasurements": ["P-C01-OUT", "TORQUE-C01", "FLOW-F01", "T-H01-IN", "T-H02-IN"]}, "type": "equipment", "style": {"width": 215, "height": 275}, "width": 215, "height": 275, "dragging": false, "position": {"x": 645, "y": 15}, "resizing": false, "selected": false, "positionAbsolute": {"x": 645, "y": 15}}, {"id": "instrument_1753868440913", "data": {"color": "#6b7280", "label": "계측기", "nodeSize": "1", "measurements": [], "instrumentName": "계측기", "instrumentType": "I1", "displayMeasurements": ["LOAD-C01", "VIB-F01", "F-H01-FLOW", "T-H02-OUT", "T-001-WND", "P-001-DIS", "T-004-MOT"]}, "type": "instrument", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 300, "y": 390}, "selected": false, "positionAbsolute": {"x": 300, "y": 390}}], "nodeSize": "1"}', 'newfor_krn - Version 2025. 7. 30. 오후 6:41:56', 'Saved from editor at 2025. 7. 30. 오후 6:41:56', 'd65db892-9691-46e3-a2c6-d962980f2f51', '2025-07-30 18:41:56.320255+09', false, NULL, NULL, NULL, 'USER', 'PRIVATE', false);
INSERT INTO public.personal_test_process_flow_versions (id, flow_id, version_number, flow_data, name, description, created_by, created_at, is_published, published_at, publish_token, data_source_id, scope_type, visibility_scope, shared_with_workspace) VALUES ('4150f937-8d2e-4b84-8352-06c1f44d3b32', '408d8e72-43e1-4c36-ba93-4ca9a81fe454', 1, '{"edges": [{"id": "reactflow__edge-COMMON_1753867424402-instrument_1753867433473", "data": {"type": "step"}, "type": "step", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1753867424402", "target": "instrument_1753867433473", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-instrument_1753867433473-COMMON_1753867449521", "data": {"type": "step"}, "type": "step", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "instrument_1753867433473", "target": "COMMON_1753867449521", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-COMMON_1753867449521-table_1753867446226", "data": {"type": "step"}, "type": "step", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1753867449521", "target": "table_1753867446226", "animated": false, "sourceHandle": null, "targetHandle": null}], "nodes": [{"id": "COMMON_1753867424402", "data": {"icon": "settings", "label": "Air Compressor Unit 1", "status": "STOP", "nodeSize": "1", "equipmentCode": "COMP-001", "equipmentName": "Air Compressor Unit 1", "equipmentType": "Compressor", "displayMeasurements": ["P-C01-OUT", "P-C02-OUT", "LOAD-C01", "DP-F01"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 240, "y": -45}, "selected": false, "positionAbsolute": {"x": 240, "y": -45}}, {"id": "instrument_1753867433473", "data": {"color": "#6b7280", "label": "계측기", "nodeSize": "1", "measurements": [], "instrumentName": "계측기", "instrumentType": "I1", "displayMeasurements": ["P-C01-OUT", "P-C03-OUT", "AMP-F01", "VOLT-G01", "EFF-H02"]}, "type": "instrument", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 525, "y": -45}, "selected": false, "positionAbsolute": {"x": 525, "y": -45}}, {"id": "table_1753867446226", "data": {"color": "#3b82f6", "label": "Custom Table", "nodeSize": "2", "queryConfig": {"sql": "select *\nfrom vw_measurement_data_mock", "dataSourceId": "2881a01f-1eed-4343-b0d1-5d8d22f6744a", "refreshInterval": 30}, "statusRules": {"idField": "measurement_code", "lslField": "lsl", "uslField": "usl", "valueField": "measurement_value"}, "tableConfig": {"columns": [{"type": "id", "field": "measurement_code", "width": 60, "header": "ID"}, {"type": "value", "field": "measurement_value", "width": 80, "header": "Value"}, {"type": "usl", "field": "usl", "width": 60, "header": "USL"}, {"type": "lsl", "field": "lsl", "width": 60, "header": "LSL"}, {"type": "status", "field": "status", "width": 80, "header": "Status"}], "maxRows": 50, "displayMode": "table"}}, "type": "table", "style": {"width": 745, "height": 360}, "width": 745, "height": 360, "dragging": false, "position": {"x": 240, "y": 345}, "resizing": false, "selected": false, "positionAbsolute": {"x": 240, "y": 345}}, {"id": "COMMON_1753867449521", "data": {"icon": "settings", "label": "Crane Hoist Motor", "status": "STOP", "nodeSize": "1", "equipmentCode": "MOTOR-004", "equipmentName": "Crane Hoist Motor", "equipmentType": "Motor", "displayMeasurements": ["HOUR-C01", "T-C01-OUT", "P-C03-OUT", "TORQUE-C01", "VOLT-G01"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 870, "y": -45}, "selected": false, "positionAbsolute": {"x": 870, "y": -45}}], "nodeSize": "1"}', 'dashboard for krn - Version 2025. 7. 31. 오전 10:28:24', 'Saved from editor at 2025. 7. 31. 오전 10:28:24', 'd65db892-9691-46e3-a2c6-d962980f2f51', '2025-07-31 10:28:24.501137+09', false, NULL, NULL, NULL, 'USER', 'PRIVATE', false);
INSERT INTO public.personal_test_process_flow_versions (id, flow_id, version_number, flow_data, name, description, created_by, created_at, is_published, published_at, publish_token, data_source_id, scope_type, visibility_scope, shared_with_workspace) VALUES ('78fed509-8795-4cb3-93c7-9c7891eb584c', '75a0f1b8-984e-4003-94ad-7f99a44e494f', 1, '{"edges": [{"id": "reactflow__edge-COMMON_1753867424402-instrument_1753867433473", "data": {"type": "step"}, "type": "step", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1753867424402", "target": "instrument_1753867433473", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-instrument_1753867433473-COMMON_1753867449521", "data": {"type": "step"}, "type": "step", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "instrument_1753867433473", "target": "COMMON_1753867449521", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-COMMON_1753867449521-table_1753867446226", "data": {"type": "step"}, "type": "step", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1753867449521", "target": "table_1753867446226", "animated": false, "sourceHandle": null, "targetHandle": null}], "nodes": [{"id": "COMMON_1753867424402", "data": {"icon": "settings", "label": "Air Compressor Unit 1", "status": "STOP", "nodeSize": "1", "equipmentCode": "COMP-001", "equipmentName": "Air Compressor Unit 1", "equipmentType": "Compressor", "displayMeasurements": ["P-C01-OUT", "P-C02-OUT", "LOAD-C01", "DP-F01"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 240, "y": -45}, "selected": false, "positionAbsolute": {"x": 240, "y": -45}}, {"id": "instrument_1753867433473", "data": {"color": "#6b7280", "label": "계측기", "nodeSize": "1", "measurements": [], "instrumentName": "계측기", "instrumentType": "I1", "displayMeasurements": ["P-C01-OUT", "P-C03-OUT", "AMP-F01", "VOLT-G01", "EFF-H02"]}, "type": "instrument", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 525, "y": -45}, "selected": false, "positionAbsolute": {"x": 525, "y": -45}}, {"id": "table_1753867446226", "data": {"color": "#3b82f6", "label": "Custom Table", "nodeSize": "2", "queryConfig": {"sql": "select *\nfrom vw_measurement_data_mock", "dataSourceId": "2881a01f-1eed-4343-b0d1-5d8d22f6744a", "refreshInterval": 30}, "statusRules": {"idField": "measurement_code", "lslField": "lsl", "uslField": "usl", "valueField": "measurement_value"}, "tableConfig": {"columns": [{"type": "id", "field": "measurement_code", "width": 60, "header": "ID"}, {"type": "value", "field": "measurement_value", "width": 80, "header": "Value"}, {"type": "usl", "field": "usl", "width": 60, "header": "USL"}, {"type": "lsl", "field": "lsl", "width": 60, "header": "LSL"}, {"type": "status", "field": "status", "width": 80, "header": "Status"}], "maxRows": 50, "displayMode": "table"}}, "type": "table", "style": {"width": 745, "height": 360}, "width": 745, "height": 360, "dragging": false, "position": {"x": 240, "y": 345}, "resizing": false, "selected": false, "positionAbsolute": {"x": 240, "y": 345}}, {"id": "COMMON_1753867449521", "data": {"icon": "settings", "label": "Crane Hoist Motor", "status": "STOP", "nodeSize": "1", "equipmentCode": "MOTOR-004", "equipmentName": "Crane Hoist Motor", "equipmentType": "Motor", "displayMeasurements": ["HOUR-C01", "T-C01-OUT", "P-C03-OUT", "TORQUE-C01", "VOLT-G01"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 870, "y": -45}, "selected": false, "positionAbsolute": {"x": 870, "y": -45}}], "nodeSize": "1"}', 'dashboard for krn - Version 2025. 7. 31. 오전 11:53:30', 'Saved from editor at 2025. 7. 31. 오전 11:53:30', 'd65db892-9691-46e3-a2c6-d962980f2f51', '2025-07-31 11:53:30.899508+09', false, NULL, NULL, NULL, 'USER', 'PRIVATE', false);
INSERT INTO public.personal_test_process_flow_versions (id, flow_id, version_number, flow_data, name, description, created_by, created_at, is_published, published_at, publish_token, data_source_id, scope_type, visibility_scope, shared_with_workspace) VALUES ('d0bf705e-3c42-4030-bc39-b6036ddec79f', '8c161be6-a389-4cee-981d-d04403ae75a1', 1, '{"edges": [{"id": "reactflow__edge-COMMON_1753867424402-instrument_1753867433473", "data": {"type": "step"}, "type": "step", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1753867424402", "target": "instrument_1753867433473", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-instrument_1753867433473-COMMON_1753867449521", "data": {"type": "step"}, "type": "step", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "instrument_1753867433473", "target": "COMMON_1753867449521", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-COMMON_1753867449521-table_1753867446226", "data": {"type": "step"}, "type": "step", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1753867449521", "target": "table_1753867446226", "animated": false, "sourceHandle": null, "targetHandle": null}], "nodes": [{"id": "COMMON_1753867424402", "data": {"icon": "settings", "label": "Air Compressor Unit 1", "status": "STOP", "nodeSize": "1", "equipmentCode": "COMP-001", "equipmentName": "Air Compressor Unit 1", "equipmentType": "Compressor", "displayMeasurements": ["P-C01-OUT", "P-C02-OUT", "LOAD-C01", "DP-F01"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 240, "y": -45}, "selected": false, "positionAbsolute": {"x": 240, "y": -45}}, {"id": "instrument_1753867433473", "data": {"color": "#6b7280", "label": "계측기", "nodeSize": "1", "measurements": [], "instrumentName": "계측기", "instrumentType": "I1", "displayMeasurements": ["P-C01-OUT", "P-C03-OUT", "AMP-F01", "VOLT-G01", "EFF-H02"]}, "type": "instrument", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 525, "y": -45}, "selected": false, "positionAbsolute": {"x": 525, "y": -45}}, {"id": "table_1753867446226", "data": {"color": "#3b82f6", "label": "Custom Table", "nodeSize": "2", "queryConfig": {"sql": "select *\nfrom vw_measurement_data_mock", "dataSourceId": "2881a01f-1eed-4343-b0d1-5d8d22f6744a", "refreshInterval": 30}, "statusRules": {"idField": "measurement_code", "lslField": "lsl", "uslField": "usl", "valueField": "measurement_value"}, "tableConfig": {"columns": [{"type": "id", "field": "measurement_code", "width": 60, "header": "ID"}, {"type": "value", "field": "measurement_value", "width": 80, "header": "Value"}, {"type": "usl", "field": "usl", "width": 60, "header": "USL"}, {"type": "lsl", "field": "lsl", "width": 60, "header": "LSL"}, {"type": "status", "field": "status", "width": 80, "header": "Status"}], "maxRows": 50, "displayMode": "table"}}, "type": "table", "style": {"width": 745, "height": 360}, "width": 745, "height": 360, "dragging": false, "position": {"x": 240, "y": 345}, "resizing": false, "selected": false, "positionAbsolute": {"x": 240, "y": 345}}, {"id": "COMMON_1753867449521", "data": {"icon": "settings", "label": "Crane Hoist Motor", "status": "STOP", "nodeSize": "1", "equipmentCode": "MOTOR-004", "equipmentName": "Crane Hoist Motor", "equipmentType": "Motor", "displayMeasurements": ["HOUR-C01", "T-C01-OUT", "P-C03-OUT", "TORQUE-C01", "VOLT-G01"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 870, "y": -45}, "selected": false, "positionAbsolute": {"x": 870, "y": -45}}], "nodeSize": "1"}', 'dashboard for krn - Version 2025. 7. 31. 오전 11:54:16', 'Saved from editor at 2025. 7. 31. 오전 11:54:16', 'd65db892-9691-46e3-a2c6-d962980f2f51', '2025-07-31 11:54:16.311863+09', false, NULL, NULL, NULL, 'USER', 'PRIVATE', false);
INSERT INTO public.personal_test_process_flow_versions (id, flow_id, version_number, flow_data, name, description, created_by, created_at, is_published, published_at, publish_token, data_source_id, scope_type, visibility_scope, shared_with_workspace) VALUES ('5f537630-ad43-4842-a88e-8f07401980d0', '74795e1b-5148-460b-9068-2ecbbc2099aa', 1, '{"edges": [{"id": "reactflow__edge-COMMON_1753867424402-instrument_1753867433473", "data": {"type": "step"}, "type": "step", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1753867424402", "target": "instrument_1753867433473", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-instrument_1753867433473-COMMON_1753867449521", "data": {"type": "step"}, "type": "step", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "instrument_1753867433473", "target": "COMMON_1753867449521", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-COMMON_1753867449521-table_1753867446226", "data": {"type": "step"}, "type": "step", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1753867449521", "target": "table_1753867446226", "animated": false, "sourceHandle": null, "targetHandle": null}], "nodes": [{"id": "COMMON_1753867424402", "data": {"icon": "settings", "label": "Air Compressor Unit 1", "status": "STOP", "nodeSize": "1", "equipmentCode": "COMP-001", "equipmentName": "Air Compressor Unit 1", "equipmentType": "Compressor", "displayMeasurements": ["P-C01-OUT", "P-C02-OUT", "LOAD-C01", "DP-F01"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 240, "y": -45}, "selected": false, "positionAbsolute": {"x": 240, "y": -45}}, {"id": "instrument_1753867433473", "data": {"color": "#6b7280", "label": "계측기", "nodeSize": "1", "measurements": [], "instrumentName": "계측기", "instrumentType": "I1", "displayMeasurements": ["P-C01-OUT", "P-C03-OUT", "AMP-F01", "VOLT-G01", "EFF-H02"]}, "type": "instrument", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 525, "y": -45}, "selected": false, "positionAbsolute": {"x": 525, "y": -45}}, {"id": "table_1753867446226", "data": {"color": "#3b82f6", "label": "Custom Table", "nodeSize": "2", "queryConfig": {"sql": "select *\nfrom vw_measurement_data_mock", "dataSourceId": "2881a01f-1eed-4343-b0d1-5d8d22f6744a", "refreshInterval": 30}, "statusRules": {"idField": "measurement_code", "lslField": "lsl", "uslField": "usl", "valueField": "measurement_value"}, "tableConfig": {"columns": [{"type": "id", "field": "measurement_code", "width": 60, "header": "ID"}, {"type": "value", "field": "measurement_value", "width": 80, "header": "Value"}, {"type": "usl", "field": "usl", "width": 60, "header": "USL"}, {"type": "lsl", "field": "lsl", "width": 60, "header": "LSL"}, {"type": "status", "field": "status", "width": 80, "header": "Status"}], "maxRows": 50, "displayMode": "table"}}, "type": "table", "style": {"width": 745, "height": 360}, "width": 745, "height": 360, "dragging": false, "position": {"x": 240, "y": 345}, "resizing": false, "selected": false, "positionAbsolute": {"x": 240, "y": 345}}, {"id": "COMMON_1753867449521", "data": {"icon": "settings", "label": "Crane Hoist Motor", "status": "STOP", "nodeSize": "1", "equipmentCode": "MOTOR-004", "equipmentName": "Crane Hoist Motor", "equipmentType": "Motor", "displayMeasurements": ["HOUR-C01", "T-C01-OUT", "P-C03-OUT", "TORQUE-C01", "VOLT-G01"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 870, "y": -45}, "selected": false, "positionAbsolute": {"x": 870, "y": -45}}], "nodeSize": "1"}', 'krnkrn_new - Version 2025. 7. 31. 오전 11:58:55', 'Saved from editor at 2025. 7. 31. 오전 11:58:55', 'd65db892-9691-46e3-a2c6-d962980f2f51', '2025-07-31 11:58:56.001703+09', false, NULL, NULL, NULL, 'USER', 'PRIVATE', false);


--
-- TOC entry 5295 (class 0 OID 19954)
-- Dependencies: 232
-- Data for Name: personal_test_process_flows; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.personal_test_process_flows (id, workspace_id, name, flow_data, created_by, created_at, updated_at, is_published, published_at, publish_token, current_version, data_source_id, scope_type, visibility_scope, shared_with_workspace) VALUES ('5dd3307d-9828-4c64-b1b6-f37299909022', '21ee03db-90c4-4592-b00f-c44801e0b164', 'test new resizer', '{"edges": [{"id": "reactflow__edge-COMMON_1752645086051-COMMON_1752645101683", "data": {"type": "step"}, "type": "step", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1752645086051", "target": "COMMON_1752645101683", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-COMMON_1752641468260-COMMON_1752645086051", "data": {"type": "step"}, "type": "step", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1752641468260", "target": "COMMON_1752645086051", "animated": false, "sourceHandle": null, "targetHandle": null}], "nodes": [{"id": "COMMON_1752641468260", "data": {"icon": "settings", "label": "Main Conveyor Belt", "status": "STOP", "nodeSize": "3", "equipmentCode": "CONV-01", "equipmentName": "Main Conveyor Belt", "equipmentType": "Conveyor", "displayMeasurements": ["P-C01-OUT", "HOUR-C01", "T-C01-OUT", "P-C02-OUT", "T-C02-OUT", "OIL-C03"]}, "type": "equipment", "style": {"width": 200, "height": 270}, "width": 200, "height": 270, "dragging": false, "position": {"x": 210, "y": -405}, "selected": true, "positionAbsolute": {"x": 210, "y": -405}}, {"id": "COMMON_1752645086051", "data": {"icon": "settings", "label": "Main Conveyor Belt", "status": "STOP", "nodeSize": "3", "equipmentCode": "CONV-01", "equipmentName": "Main Conveyor Belt", "equipmentType": "Conveyor", "displayMeasurements": ["P-C01-OUT", "TORQUE-C01", "FUEL-G01"]}, "type": "equipment", "style": {"width": 200, "height": 420}, "width": 200, "height": 420, "dragging": false, "position": {"x": 180, "y": -30}, "resizing": false, "selected": false, "positionAbsolute": {"x": 180, "y": -30}}, {"id": "COMMON_1752645101683", "data": {"icon": "settings", "label": "Ventilation Fan Motor", "status": "STOP", "nodeSize": "3", "equipmentCode": "MOTOR-002", "equipmentName": "Ventilation Fan Motor", "equipmentType": "Motor", "displayMeasurements": ["P-C01-OUT", "LOAD-C01", "FLOW-F01", "DP-H02", "HUMID-HVAC", "S-001-RPM", "VIB-M03", "T-001-BRG", "PRES-P05"]}, "type": "equipment", "style": {"width": 455, "height": 270}, "width": 455, "height": 270, "dragging": false, "position": {"x": 585, "y": -45}, "resizing": false, "selected": false, "positionAbsolute": {"x": 585, "y": -45}}], "nodeSize": "3"}', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-16 13:54:03.898249+09', '2025-07-16 14:56:38.32845+09', true, '2025-07-16 13:54:31.103668+09', 'Qy_GXC3WninMHRYfLXRetomi2HX3CgEMT2iLuMWQ6cU', 1, '2881a01f-1eed-4343-b0d1-5d8d22f6744a', 'USER', 'PRIVATE', false);
INSERT INTO public.personal_test_process_flows (id, workspace_id, name, flow_data, created_by, created_at, updated_at, is_published, published_at, publish_token, current_version, data_source_id, scope_type, visibility_scope, shared_with_workspace) VALUES ('9987a1a8-ea91-4b88-81b6-9b59cb423317', '21ee03db-90c4-4592-b00f-c44801e0b164', 'New Process Flow', '{"edges": [{"id": "reactflow__edge-A1_1751029300788-B1_1751029303260", "source": "A1_1751029300788", "target": "B1_1751029303260", "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-B1_1751029303260-C1_1751029308966", "source": "B1_1751029303260", "target": "C1_1751029308966", "sourceHandle": null, "targetHandle": null}], "nodes": [{"id": "A1_1751029300788", "data": {"icon": "gauge", "label": "감압기", "status": "STOP", "equipmentName": "감압기", "equipmentType": "A1"}, "type": "equipment", "width": 150, "height": 84, "dragging": false, "position": {"x": 10.508966731179726, "y": -90.13639232926076}, "selected": false, "positionAbsolute": {"x": 10.508966731179726, "y": -90.13639232926076}}, {"id": "B1_1751029303260", "data": {"icon": "activity", "label": "차압기", "status": "STOP", "equipmentName": "차압기", "equipmentType": "B1"}, "type": "equipment", "width": 150, "height": 84, "dragging": false, "position": {"x": 159.50747254529767, "y": 76.98505490940482}, "selected": false, "positionAbsolute": {"x": 159.50747254529767, "y": 76.98505490940482}}, {"id": "C1_1751029308966", "data": {"icon": "filter", "label": "흡착기", "status": "STOP", "equipmentName": "흡착기", "equipmentType": "C1"}, "type": "equipment", "width": 150, "height": 84, "dragging": false, "position": {"x": 548.6631667264176, "y": 170.24091945484332}, "selected": true, "positionAbsolute": {"x": 548.6631667264176, "y": 170.24091945484332}}, {"id": "C2_1751029364143", "data": {"icon": "thermometer", "label": "측정기", "status": "STOP", "equipmentName": "측정기", "equipmentType": "C2"}, "type": "equipment", "width": 150, "height": 84, "dragging": false, "position": {"x": 74.45412418235304, "y": 250}, "selected": false, "positionAbsolute": {"x": 74.45412418235304, "y": 250}}, {"id": "D1_1751029368314", "data": {"icon": "wind", "label": "압축기", "status": "STOP", "equipmentName": "압축기", "equipmentType": "D1"}, "type": "equipment", "width": 150, "height": 84, "position": {"x": 250, "y": 250}}, {"id": "D2_1751029369046", "data": {"icon": "zap", "label": "펌프", "status": "STOP", "equipmentName": "펌프", "equipmentType": "D2"}, "type": "equipment", "width": 150, "height": 84, "dragging": false, "position": {"x": 426.59704872673467, "y": 250}, "selected": false, "positionAbsolute": {"x": 426.59704872673467, "y": 250}}, {"id": "E1_1751029371078", "data": {"icon": "database", "label": "탱크", "status": "STOP", "equipmentName": "탱크", "equipmentType": "E1"}, "type": "equipment", "width": 150, "height": 84, "dragging": false, "position": {"x": 70.24943254600225, "y": 383.4989594541386}, "selected": false, "positionAbsolute": {"x": 70.24943254600225, "y": 383.4989594541386}}, {"id": "E2_1751029373161", "data": {"icon": "archive", "label": "저장탱크", "status": "STOP", "equipmentName": "저장탱크", "equipmentType": "E2"}, "type": "equipment", "width": 150, "height": 84, "dragging": false, "position": {"x": 263.6652478181402, "y": 380.34544072687555}, "selected": false, "positionAbsolute": {"x": 263.6652478181402, "y": 380.34544072687555}}, {"id": "F1_1751029374912", "data": {"icon": "git-merge", "label": "밸브", "status": "STOP", "equipmentName": "밸브", "equipmentType": "F1"}, "type": "equipment", "width": 150, "height": 84, "dragging": false, "position": {"x": 448.67167981757643, "y": 378.24309490870013}, "selected": false, "positionAbsolute": {"x": 448.67167981757643, "y": 378.24309490870013}}, {"id": "G1_1751029376756", "data": {"icon": "flame", "label": "히터", "status": "STOP", "equipmentName": "히터", "equipmentType": "G1"}, "type": "equipment", "width": 150, "height": 84, "dragging": false, "position": {"x": 635.7804576351881, "y": 390.85716981775266}, "selected": false, "positionAbsolute": {"x": 635.7804576351881, "y": 390.85716981775266}}]}', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-06-27 22:04:16.616456+09', '2025-06-27 22:04:16.616456+09', false, NULL, NULL, 1, '2881a01f-1eed-4343-b0d1-5d8d22f6744a', 'USER', 'PRIVATE', false);
INSERT INTO public.personal_test_process_flows (id, workspace_id, name, flow_data, created_by, created_at, updated_at, is_published, published_at, publish_token, current_version, data_source_id, scope_type, visibility_scope, shared_with_workspace) VALUES ('eed16ebd-efe5-4f5c-be40-5466ff4356a0', '21ee03db-90c4-4592-b00f-c44801e0b164', '샘플공정도2', '{"edges": [{"id": "reactflow__edge-_1751085089714-B1_1751085115749", "type": "smoothstep", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "_1751085089714", "target": "B1_1751085115749", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-_1751085089714-G1_1751085108606", "type": "straight", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "_1751085089714", "target": "G1_1751085108606", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-B1_1751085115749-E1_1751085118930", "type": "default", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "B1_1751085115749", "target": "E1_1751085118930", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-E1_1751085118930-E2_1751085155514", "type": "smoothstep", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "E1_1751085118930", "target": "E2_1751085155514", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-G1_1751085108606-E2_1751085155514", "type": "default", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "G1_1751085108606", "target": "E2_1751085155514", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}], "nodes": [{"id": "_1751085089714", "data": {"icon": "settings", "label": "감압기", "status": "STOP", "equipmentCode": "A101", "equipmentName": "감압기", "equipmentType": "A1", "displayMeasurements": ["TG-001", "TG-002"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": -90, "y": 80}, "selected": false, "positionAbsolute": {"x": -90, "y": 80}}, {"id": "G1_1751085108606", "data": {"icon": "flame", "label": "히터", "status": "STOP", "equipmentCode": "G101", "equipmentName": "히터", "equipmentType": "G1", "displayMeasurements": ["TH-101", "PW-101"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": -90, "y": 450}, "selected": false, "positionAbsolute": {"x": -90, "y": 450}}, {"id": "B1_1751085115749", "data": {"icon": "activity", "label": "차압기", "status": "STOP", "equipmentCode": "B101", "equipmentName": "차압기", "equipmentType": "B1", "displayMeasurements": ["TF-928"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 130, "y": 450}, "selected": false, "positionAbsolute": {"x": 130, "y": 450}}, {"id": "E1_1751085118930", "data": {"icon": "database", "label": "탱크", "status": "STOP", "equipmentCode": "E101", "equipmentName": "탱크", "equipmentType": "E1", "displayMeasurements": ["LV-101"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 350, "y": 800}, "selected": false, "positionAbsolute": {"x": 350, "y": 800}}, {"id": "E2_1751085155514", "data": {"icon": "archive", "label": "저장탱크", "status": "STOP", "equipmentCode": "E201", "equipmentName": "저장탱크", "equipmentType": "E2", "displayMeasurements": []}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 60, "y": 1110}, "selected": true, "positionAbsolute": {"x": 60, "y": 1110}}]}', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-06-28 13:33:13.098548+09', '2025-07-03 21:45:17.906466+09', false, NULL, NULL, 2, '2881a01f-1eed-4343-b0d1-5d8d22f6744a', 'USER', 'PRIVATE', false);
INSERT INTO public.personal_test_process_flows (id, workspace_id, name, flow_data, created_by, created_at, updated_at, is_published, published_at, publish_token, current_version, data_source_id, scope_type, visibility_scope, shared_with_workspace) VALUES ('116675b3-43cb-4a93-986b-e6c133204d16', '21ee03db-90c4-4592-b00f-c44801e0b164', '샘플 공정도', '{"edges": [{"id": "reactflow__edge-A1_1751073324228-C2_1751073352895", "type": "step", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "A1_1751073324228", "target": "C2_1751073352895", "animated": false, "selected": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-B1_1751073343571-D2_1751077257073", "type": "step", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "B1_1751073343571", "target": "D2_1751077257073", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-D2_1751083266771-A1_1751083245170", "type": "default", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "D2_1751083266771", "target": "A1_1751083245170", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-B1_1751083289433-A1_1751083312881", "type": "smoothstep", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "B1_1751083289433", "target": "A1_1751083312881", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-D2_1751077257073-E2_1751083457125", "type": "step", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "D2_1751077257073", "target": "E2_1751083457125", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-E2_1751083457125-G1_1751083499986", "type": "straight", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "E2_1751083457125", "target": "G1_1751083499986", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-G1_1751083499986-D1_1751083531907", "type": "smoothstep", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "G1_1751083499986", "target": "D1_1751083531907", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-D1_1751083531907-E1_1751083480473", "type": "default", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "D1_1751083531907", "target": "E1_1751083480473", "animated": false, "selectable": true, "sourceHandle": null, "targetHandle": null}], "nodes": [{"id": "A1_1751073324228", "data": {"icon": "gauge", "label": "감압기", "status": "STOP", "equipmentCode": "A101", "equipmentName": "감압기", "equipmentType": "A1", "displayMeasurements": ["TG-001", "TG-002"]}, "type": "equipment", "style": {"width": 211, "height": 170}, "width": 211, "height": 170, "dragging": false, "position": {"x": 130, "y": 200}, "resizing": false, "selected": false, "positionAbsolute": {"x": 130, "y": 200}}, {"id": "B1_1751073343571", "data": {"icon": "activity", "label": "차압기", "status": "STOP", "equipmentCode": "B101", "equipmentName": "차압기", "equipmentType": "B1", "displayMeasurements": ["TF-928", "TF-929"]}, "type": "equipment", "style": {"width": 208, "height": 170}, "width": 208, "height": 170, "dragging": false, "position": {"x": 360, "y": 200}, "resizing": false, "selected": false, "positionAbsolute": {"x": 360, "y": 200}}, {"id": "C2_1751073352895", "data": {"icon": "thermometer", "label": "측정기", "status": "STOP", "equipmentCode": "C201", "equipmentName": "측정기", "equipmentType": "C2", "displayMeasurements": ["TS-201"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 135.5, "y": 525.6838827115021}, "selected": false, "positionAbsolute": {"x": 135.03774814099847, "y": 525.6838827115021}}, {"id": "D2_1751077257073", "data": {"icon": "zap", "label": "펌프", "status": "STOP", "equipmentCode": "D201", "equipmentName": "펌프", "equipmentType": "D2", "displayMeasurements": ["FL-201"]}, "type": "equipment", "style": {"width": 210, "height": 220}, "width": 210, "height": 220, "dragging": false, "position": {"x": 430, "y": 500}, "resizing": false, "selected": false, "positionAbsolute": {"x": 430, "y": 500}}, {"id": "group_1751077454819", "data": {"color": "#ff8080", "label": "Group"}, "type": "group", "style": {"width": 1276, "height": 808, "zIndex": -1}, "width": 1276, "height": 808, "dragging": false, "position": {"x": 40, "y": 120}, "resizing": false, "selected": false, "positionAbsolute": {"x": 40, "y": 120}}, {"id": "A1_1751083245170", "data": {"icon": "gauge", "label": "감압기", "status": "STOP", "equipmentCode": "A101", "equipmentName": "감압기", "equipmentType": "A1", "displayMeasurements": ["TG-001", "TG-002"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 660, "y": 530}, "selected": false, "positionAbsolute": {"x": 660, "y": 530}}, {"id": "D2_1751083266771", "data": {"icon": "zap", "label": "펌프", "status": "STOP", "equipmentCode": "D201", "equipmentName": "펌프", "equipmentType": "D2", "displayMeasurements": ["FL-201"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 720, "y": 200}, "selected": false, "positionAbsolute": {"x": 720, "y": 200}}, {"id": "B1_1751083289433", "data": {"icon": "activity", "label": "차압기", "status": "STOP", "equipmentCode": "B101", "equipmentName": "차압기", "equipmentType": "B1", "displayMeasurements": ["TF-928", "TF-929"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 930, "y": 200}, "selected": false, "positionAbsolute": {"x": 930, "y": 200}}, {"id": "A1_1751083312881", "data": {"icon": "gauge", "label": "감압기", "status": "STOP", "equipmentCode": "A101", "equipmentName": "감압기", "equipmentType": "A1", "displayMeasurements": ["TG-001", "TG-002"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 1000, "y": 550}, "selected": false, "positionAbsolute": {"x": 1000, "y": 550}}, {"id": "group_1751083444956", "data": {"color": "#3b82f6", "label": "Group"}, "type": "group", "style": {"width": 550, "height": 510, "zIndex": -1}, "width": 550, "height": 510, "dragging": false, "position": {"x": -1370, "y": 480}, "resizing": false, "selected": false, "positionAbsolute": {"x": -1370, "y": 480}}, {"id": "E2_1751083457125", "data": {"icon": "archive", "label": "저장탱크", "status": "STOP", "equipmentCode": "E201", "equipmentName": "저장탱크", "equipmentType": "E2", "displayMeasurements": []}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": -1250, "y": 580}, "selected": false, "positionAbsolute": {"x": -1250, "y": 580}}, {"id": "E1_1751083480473", "data": {"icon": "database", "label": "탱크", "status": "STOP", "equipmentCode": "E101", "equipmentName": "탱크", "equipmentType": "E1", "displayMeasurements": ["LV-101", "PR-101"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 720, "y": 1180}, "selected": false, "positionAbsolute": {"x": 720, "y": 1180}}, {"id": "group_1751083486315", "data": {"color": "#75f09a", "label": "Group"}, "type": "group", "style": {"width": 960, "height": 450, "zIndex": -1}, "width": 960, "height": 450, "dragging": false, "position": {"x": 50, "y": 1080}, "resizing": false, "selected": false, "positionAbsolute": {"x": 50, "y": 1080}}, {"id": "G1_1751083499986", "data": {"icon": "flame", "label": "히터", "status": "STOP", "equipmentCode": "G101", "equipmentName": "히터", "equipmentType": "G1", "displayMeasurements": ["TH-101", "PW-101"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 90, "y": 1170}, "selected": false, "positionAbsolute": {"x": 90, "y": 1170}}, {"id": "D1_1751083531907", "data": {"icon": "wind", "label": "압축기", "status": "STOP", "equipmentCode": "D101", "equipmentName": "압축기", "equipmentType": "D1", "displayMeasurements": ["PC-101", "TC-101"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 400, "y": 1170}, "selected": false, "positionAbsolute": {"x": 400, "y": 1170}}, {"id": "COMMON_1751546846753", "data": {"icon": "settings", "label": "공통설비", "status": "STOP", "equipmentCode": "", "equipmentName": "공통설비", "equipmentType": "COMMON", "displayMeasurements": []}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": -555, "y": 75}, "selected": false, "positionAbsolute": {"x": -555, "y": 75}}, {"id": "text_1751547206517", "data": {"text": "Text", "color": "#000000", "padding": 8, "fontSize": 14, "textAlign": "center", "fontWeight": "normal", "borderColor": "#999999", "borderStyle": "none", "borderWidth": 1, "backgroundColor": "#ffffff"}, "type": "text", "width": 50, "height": 37, "dragging": false, "position": {"x": -315, "y": -15}, "selected": false}, {"id": "text_1751547574665", "data": {"text": "Text", "color": "#000000", "fontSize": 14}, "type": "text", "width": 50, "height": 37, "dragging": false, "position": {"x": 120, "y": -15}, "selected": false}]}', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-06-28 10:18:47.930488+09', '2025-07-03 22:50:03.718103+09', true, '2025-07-01 22:58:01.897738+09', 'WNx2XQ5G3fhM_r8HaJUnGw3z-s9hm-F9ZZ6X3v7GpVQ', 8, '2881a01f-1eed-4343-b0d1-5d8d22f6744a', 'USER', 'PRIVATE', false);
INSERT INTO public.personal_test_process_flows (id, workspace_id, name, flow_data, created_by, created_at, updated_at, is_published, published_at, publish_token, current_version, data_source_id, scope_type, visibility_scope, shared_with_workspace) VALUES ('5ccf6d4f-eeff-49e6-b51b-6211b043efd7', '21ee03db-90c4-4592-b00f-c44801e0b164', 'Group TEST', '{"edges": [], "nodes": [{"id": "group_1752722015980", "data": {"color": "#6b7280", "label": "TEST NODE", "zIndex": -2, "titleSize": 14, "titleColor": "#374151", "borderStyle": "dashed", "titlePosition": "top", "backgroundColor": "#6b7280", "backgroundOpacity": 10}, "type": "group", "style": {"width": 320, "height": 305}, "width": 320, "height": 305, "dragging": false, "position": {"x": 690, "y": 150}, "resizing": false, "selected": false, "positionAbsolute": {"x": 690, "y": 150}}, {"id": "COMMON_1752722512948", "data": {"icon": "settings", "label": "Emergency Diesel Generator", "status": "STOP", "nodeSize": "1", "equipmentCode": "GENERATOR-01", "equipmentName": "Emergency Diesel Generator", "equipmentType": "Generator", "displayMeasurements": ["P-C01-OUT", "OIL-C03", "VIB-F01", "FREQ-G01", "T-H01-OUT", "FILTER-DP"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 750, "y": 217.5}, "selected": false, "positionAbsolute": {"x": 690, "y": 390}}], "nodeSize": "1"}', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-17 12:22:39.500591+09', '2025-07-17 13:33:48.782666+09', true, '2025-07-17 12:22:50.970412+09', '7TbtxZ6TUZ5FINGi6nwmFVUygEvKsbcrpJwsxHQCQyk', 1, '2881a01f-1eed-4343-b0d1-5d8d22f6744a', 'USER', 'PRIVATE', false);
INSERT INTO public.personal_test_process_flows (id, workspace_id, name, flow_data, created_by, created_at, updated_at, is_published, published_at, publish_token, current_version, data_source_id, scope_type, visibility_scope, shared_with_workspace) VALUES ('741990b7-fa7e-4268-bc9f-c244127c5a49', '21ee03db-90c4-4592-b00f-c44801e0b164', 'bbbbbb0715', '{"edges": [{"id": "reactflow__edge-COMMON_1752541602453-COMMON_1752541613541", "data": {"type": "default"}, "type": "default", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1752541602453", "target": "COMMON_1752541613541", "animated": false, "sourceHandle": null, "targetHandle": null}], "nodes": [{"id": "COMMON_1752541602453", "data": {"icon": "settings", "label": "Water Intake Filter", "status": "STOP", "nodeSize": "1", "equipmentCode": "FILTER-W-01", "equipmentName": "Water Intake Filter", "equipmentType": "Filter", "displayMeasurements": ["T-C01-OUT", "P-C02-OUT"]}, "type": "equipment", "style": {"width": 350, "height": 155}, "width": 350, "height": 155, "dragging": false, "position": {"x": 585, "y": 120}, "resizing": false, "selected": false, "positionAbsolute": {"x": 585, "y": 120}}, {"id": "COMMON_1752541613541", "data": {"icon": "settings", "label": "Main Exhaust Fan", "status": "STOP", "nodeSize": "1", "equipmentCode": "FAN-EX-01", "equipmentName": "Main Exhaust Fan", "equipmentType": "Fan", "displayMeasurements": ["HOUR-C01", "P-C02-OUT", "LOAD-C01", "DP-F01"]}, "type": "equipment", "style": {"width": 200, "height": 455}, "width": 200, "height": 455, "dragging": false, "position": {"x": 990, "y": 120}, "resizing": false, "selected": false, "positionAbsolute": {"x": 990, "y": 120}}], "nodeSize": "1"}', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-15 10:07:12.674325+09', '2025-07-15 10:07:12.674325+09', false, NULL, NULL, 1, NULL, 'USER', 'PRIVATE', false);
INSERT INTO public.personal_test_process_flows (id, workspace_id, name, flow_data, created_by, created_at, updated_at, is_published, published_at, publish_token, current_version, data_source_id, scope_type, visibility_scope, shared_with_workspace) VALUES ('90385230-33d2-4bc1-ac56-61db952c3126', '21ee03db-90c4-4592-b00f-c44801e0b164', 'xzxcxzcv', '{"edges": [{"id": "reactflow__edge-COMMON_1753837429272-instrument_1753837430191", "data": {"type": "step"}, "type": "step", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1753837429272", "target": "instrument_1753837430191", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-instrument_1753837430191-table_1753837448495", "data": {"type": "step"}, "type": "step", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "instrument_1753837430191", "target": "table_1753837448495", "animated": false, "sourceHandle": null, "targetHandle": null}], "nodes": [{"id": "COMMON_1753837429272", "data": {"icon": "settings", "label": "Main Exhaust Fan", "status": "STOP", "nodeSize": "1", "equipmentCode": "FAN-EX-01", "equipmentName": "Main Exhaust Fan", "equipmentType": "Fan", "displayMeasurements": ["P-C01-OUT", "P-C03-OUT", "VIB-F01", "FUEL-G01"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 570, "y": 135}, "selected": false, "positionAbsolute": {"x": 570, "y": 135}}, {"id": "instrument_1753837430191", "data": {"color": "#6b7280", "label": "계측기", "nodeSize": "1", "measurements": [], "instrumentName": "계측기", "instrumentType": "I1", "displayMeasurements": ["P-C01-OUT", "P-C03-OUT", "VIB-F01"]}, "type": "instrument", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 930, "y": 150}, "selected": false, "positionAbsolute": {"x": 930, "y": 150}}, {"id": "table_1753837448495", "data": {"color": "#3b82f6", "label": "Custom Table", "nodeSize": "2", "queryConfig": {"sql": "select *\nfrom vw_measurement_data_mock\n", "dataSourceId": "2881a01f-1eed-4343-b0d1-5d8d22f6744a", "refreshInterval": 30}, "statusRules": {"idField": "measurement_code", "lslField": "lsl", "uslField": "usl", "valueField": "measurement_value"}, "tableConfig": {"columns": [{"type": "id", "field": "measurement_code", "width": 60, "header": "ID"}, {"type": "value", "field": "measurement_value", "width": 80, "header": "Value"}, {"type": "usl", "field": "usl", "width": 60, "header": "USL"}, {"type": "lsl", "field": "lsl", "width": 60, "header": "LSL"}, {"type": "status", "field": "spec_status", "width": 80, "header": "Status"}], "maxRows": 50, "displayMode": "table"}}, "type": "table", "style": {"width": 535, "height": 690}, "width": 535, "height": 690, "dragging": false, "position": {"x": 1365, "y": 225}, "resizing": false, "selected": true, "positionAbsolute": {"x": 1365, "y": 225}}], "nodeSize": "1"}', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-30 10:04:26.341528+09', '2025-07-30 18:19:25.097131+09', true, '2025-07-30 10:12:38.528949+09', 'Ll365DDiXfirLmojY_aUtVEtjBOdFn1hFK6PL1IpOLc', 3, '2881a01f-1eed-4343-b0d1-5d8d22f6744a', 'USER', 'PRIVATE', false);
INSERT INTO public.personal_test_process_flows (id, workspace_id, name, flow_data, created_by, created_at, updated_at, is_published, published_at, publish_token, current_version, data_source_id, scope_type, visibility_scope, shared_with_workspace) VALUES ('c01b6b1a-43c2-4a73-9ca0-dec3752581d3', '21ee03db-90c4-4592-b00f-c44801e0b164', '20250701', '{"edges": [{"id": "reactflow__edge-COMMON_1752202912840-COMMON_1752202921776", "data": {"type": "step"}, "type": "step", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1752202912840", "target": "COMMON_1752202921776", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-COMMON_1752202921776-COMMON_1752202932839", "data": {"type": "smoothstep"}, "type": "smoothstep", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1752202921776", "target": "COMMON_1752202932839", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-COMMON_1752202932839-COMMON_1752202955080", "data": {"type": "default"}, "type": "default", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1752202932839", "target": "COMMON_1752202955080", "animated": false, "sourceHandle": null, "targetHandle": null}], "nodes": [{"id": "COMMON_1752202912840", "data": {"icon": "settings", "label": "Water Intake Filter", "status": "STOP", "equipmentCode": "FILTER-W-01", "equipmentName": "Water Intake Filter", "equipmentType": "Filter", "displayMeasurements": ["T-C01-OUT", "P-C01-OUT", "HOUR-C01", "P-C02-OUT"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 315, "y": 30}, "selected": false, "positionAbsolute": {"x": 315, "y": 30}}, {"id": "COMMON_1752202921776", "data": {"icon": "settings", "label": "Main Exhaust Fan", "status": "STOP", "equipmentCode": "FAN-EX-01", "equipmentName": "Main Exhaust Fan", "equipmentType": "Fan", "displayMeasurements": ["P-C01-OUT", "TORQUE-C01", "T-H01-IN", "F-H01-FLOW", "VOLT-G01"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 615, "y": 30}, "selected": false, "positionAbsolute": {"x": 615, "y": 30}}, {"id": "COMMON_1752202932839", "data": {"icon": "settings", "label": "Chemical Injection Pump", "status": "STOP", "equipmentCode": "PUMP-003", "equipmentName": "Chemical Injection Pump", "equipmentType": "Pump", "displayMeasurements": ["HOUR-C01", "P-C01-OUT", "T-C01-OUT", "OIL-C03", "DP-F01", "F-H01-FLOW", "T-H02-OUT"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 465, "y": 300}, "selected": false, "positionAbsolute": {"x": 465, "y": 300}}, {"id": "COMMON_1752202955080", "data": {"icon": "settings", "label": "Secondary Heat Exchanger", "status": "STOP", "equipmentCode": "HEATEX-02", "equipmentName": "Secondary Heat Exchanger", "equipmentType": "HeatExchanger", "displayMeasurements": ["T-H02-OUT", "LOAD-M04", "FLOW-P03", "ERR-R02"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 750, "y": 300}, "selected": false, "positionAbsolute": {"x": 750, "y": 300}}]}', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-11 12:02:58.316542+09', '2025-07-11 12:02:58.316542+09', false, NULL, NULL, 1, '2881a01f-1eed-4343-b0d1-5d8d22f6744a', 'USER', 'PRIVATE', false);
INSERT INTO public.personal_test_process_flows (id, workspace_id, name, flow_data, created_by, created_at, updated_at, is_published, published_at, publish_token, current_version, data_source_id, scope_type, visibility_scope, shared_with_workspace) VALUES ('92940b84-f440-4267-ad5f-2e80dc6005ee', '21ee03db-90c4-4592-b00f-c44801e0b164', 'ㄴㅍㅌㅊㅍ', '{"edges": [], "nodes": [{"id": "COMMON_1753141739323", "data": {"icon": "settings", "label": "Water Intake Filter", "status": "STOP", "nodeSize": "1", "equipmentCode": "FILTER-W-01", "equipmentName": "Water Intake Filter", "equipmentType": "Filter", "displayMeasurements": ["P-C01-OUT", "T-C01-OUT", "T-C02-OUT", "LOAD-C01"]}, "type": "equipment", "style": {"width": 200, "height": 230}, "width": 200, "height": 230, "dragging": false, "position": {"x": 690, "y": 330}, "resizing": false, "selected": true, "positionAbsolute": {"x": 690, "y": 330}}], "nodeSize": "1"}', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-22 08:49:15.386466+09', '2025-07-22 08:49:15.386466+09', false, NULL, NULL, 1, NULL, 'USER', 'PRIVATE', false);
INSERT INTO public.personal_test_process_flows (id, workspace_id, name, flow_data, created_by, created_at, updated_at, is_published, published_at, publish_token, current_version, data_source_id, scope_type, visibility_scope, shared_with_workspace) VALUES ('af88e399-fe56-495f-8289-7c22c26a5dcb', '21ee03db-90c4-4592-b00f-c44801e0b164', 'New Process Flow', '{"edges": [], "nodes": [{"id": "COMMON_1753777474814", "data": {"icon": "settings", "label": "Emergency Diesel Generator", "status": "STOP", "nodeSize": "1", "equipmentCode": "GENERATOR-01", "equipmentName": "Emergency Diesel Generator", "equipmentType": "Generator", "displayMeasurements": []}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 420, "y": 135}, "selected": false, "positionAbsolute": {"x": 420, "y": 135}}, {"id": "instrument_1753777475598", "data": {"color": "#6b7280", "label": "계측기", "nodeSize": "1", "measurements": [], "instrumentName": "계측기", "instrumentType": "I1", "displayMeasurements": ["P-C01-OUT", "P-C02-OUT"]}, "type": "instrument", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 720, "y": 120}, "selected": false, "positionAbsolute": {"x": 720, "y": 120}}], "nodeSize": "1"}', 'd65db892-9691-46e3-a2c6-d962980f2f51', '2025-07-29 17:24:53.384536+09', '2025-07-30 10:59:41.132246+09', false, NULL, NULL, 7, '2881a01f-1eed-4343-b0d1-5d8d22f6744a', 'WORKSPACE', 'WORKSPACE', true);
INSERT INTO public.personal_test_process_flows (id, workspace_id, name, flow_data, created_by, created_at, updated_at, is_published, published_at, publish_token, current_version, data_source_id, scope_type, visibility_scope, shared_with_workspace) VALUES ('093fb0c5-9da7-406a-9e10-480328111537', '21ee03db-90c4-4592-b00f-c44801e0b164', '20250701', '{"edges": [{"id": "reactflow__edge-COMMON_1752202912840-COMMON_1752202921776", "data": {"type": "step"}, "type": "step", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1752202912840", "target": "COMMON_1752202921776", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-COMMON_1752202921776-COMMON_1752202932839", "data": {"type": "smoothstep"}, "type": "smoothstep", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1752202921776", "target": "COMMON_1752202932839", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-COMMON_1752202932839-COMMON_1752202955080", "data": {"type": "default"}, "type": "default", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1752202932839", "target": "COMMON_1752202955080", "animated": false, "sourceHandle": null, "targetHandle": null}], "nodes": [{"id": "COMMON_1752202912840", "data": {"icon": "settings", "label": "Water Intake Filter", "status": "STOP", "equipmentCode": "FILTER-W-01", "equipmentName": "Water Intake Filter", "equipmentType": "Filter", "displayMeasurements": ["T-C01-OUT", "P-C01-OUT", "HOUR-C01", "P-C02-OUT"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 315, "y": 30}, "selected": false, "positionAbsolute": {"x": 315, "y": 30}}, {"id": "COMMON_1752202921776", "data": {"icon": "settings", "label": "Main Exhaust Fan", "status": "STOP", "equipmentCode": "FAN-EX-01", "equipmentName": "Main Exhaust Fan", "equipmentType": "Fan", "displayMeasurements": ["P-C01-OUT", "TORQUE-C01", "T-H01-IN", "F-H01-FLOW", "VOLT-G01"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 615, "y": 30}, "selected": false, "positionAbsolute": {"x": 615, "y": 30}}, {"id": "COMMON_1752202932839", "data": {"icon": "settings", "label": "Chemical Injection Pump", "status": "STOP", "equipmentCode": "PUMP-003", "equipmentName": "Chemical Injection Pump", "equipmentType": "Pump", "displayMeasurements": ["HOUR-C01", "P-C01-OUT", "T-C01-OUT", "OIL-C03", "DP-F01", "F-H01-FLOW", "T-H02-OUT"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 465, "y": 300}, "selected": false, "positionAbsolute": {"x": 465, "y": 300}}, {"id": "COMMON_1752202955080", "data": {"icon": "settings", "label": "Secondary Heat Exchanger", "status": "STOP", "equipmentCode": "HEATEX-02", "equipmentName": "Secondary Heat Exchanger", "equipmentType": "HeatExchanger", "displayMeasurements": ["T-H02-OUT", "LOAD-M04", "FLOW-P03", "ERR-R02"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 780, "y": 360}, "selected": true, "positionAbsolute": {"x": 780, "y": 360}}]}', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-11 12:03:08.00266+09', '2025-07-11 12:15:20.32283+09', true, '2025-07-11 12:15:49.295278+09', '6gqNvxmGglHLQJfGUMULQzDb0P9lfWbARf9NPk8uZcU', 1, NULL, 'USER', 'PRIVATE', false);
INSERT INTO public.personal_test_process_flows (id, workspace_id, name, flow_data, created_by, created_at, updated_at, is_published, published_at, publish_token, current_version, data_source_id, scope_type, visibility_scope, shared_with_workspace) VALUES ('f16c00d7-fdf7-4477-a5f2-4ba307b98d8b', '21ee03db-90c4-4592-b00f-c44801e0b164', 'New Process Flow', '{"edges": [], "nodes": [], "nodeSize": "1"}', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-15 10:29:19.260857+09', '2025-07-15 10:29:19.260857+09', false, NULL, NULL, 1, NULL, 'USER', 'PRIVATE', false);
INSERT INTO public.personal_test_process_flows (id, workspace_id, name, flow_data, created_by, created_at, updated_at, is_published, published_at, publish_token, current_version, data_source_id, scope_type, visibility_scope, shared_with_workspace) VALUES ('767d6e0e-9a91-4923-bb79-6d4b5d4aaf94', '21ee03db-90c4-4592-b00f-c44801e0b164', 'upgradetest', '{"edges": [{"id": "reactflow__edge-COMMON_1753678784653-instrument_1753678794061input", "data": {"type": "step"}, "type": "step", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1753678784653", "target": "instrument_1753678794061", "animated": false, "sourceHandle": null, "targetHandle": "input"}], "nodes": [{"id": "instrument_1753679790478", "data": {"label": "계측기", "nodeSize": "1", "displayMode": "simple", "gaugeConfig": {"max": 100, "min": 0, "unit": ""}, "instrumentType": "instrument", "refreshInterval": 5000, "measurementCodes": ["HOUR-C01"]}, "type": "instrument", "style": {"width": 160, "height": 80}, "width": 160, "height": 80, "dragging": false, "position": {"x": 525, "y": -60}, "selected": false, "positionAbsolute": {"x": 525, "y": -60}}, {"id": "instrument_1753679821166", "data": {"label": "계측기", "nodeSize": "1", "displayMode": "trend", "gaugeConfig": {"max": 100, "min": 0, "unit": ""}, "instrumentType": "instrument", "refreshInterval": 5000, "measurementCodes": ["P-C01-OUT"]}, "type": "instrument", "style": {"width": 160, "height": 80}, "width": 160, "height": 80, "dragging": false, "position": {"x": 750, "y": -60}, "selected": true, "positionAbsolute": {"x": 750, "y": -60}}, {"id": "instrument_1753679853397", "data": {"label": "계측기", "nodeSize": "1", "displayMode": "digital", "gaugeConfig": {"max": 100, "min": 0, "unit": ""}, "instrumentType": "instrument", "refreshInterval": 5000, "measurementCodes": ["T-C01-OUT"]}, "type": "instrument", "style": {"width": 160, "height": 80}, "width": 160, "height": 80, "dragging": false, "position": {"x": 525, "y": 105}, "selected": false, "positionAbsolute": {"x": 525, "y": 105}}, {"id": "instrument_1753679875188", "data": {"label": "계측기", "nodeSize": "1", "displayMode": "table", "gaugeConfig": {"max": 100, "min": 0, "unit": ""}, "instrumentType": "instrument", "refreshInterval": 5000, "measurementCodes": ["HOUR-C01", "P-C01-OUT"]}, "type": "instrument", "style": {"width": 160, "height": 200}, "width": 160, "height": 200, "dragging": false, "position": {"x": 765, "y": 105}, "resizing": false, "selected": false, "positionAbsolute": {"x": 765, "y": 105}}], "nodeSize": "3"}', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-28 14:16:49.451118+09', '2025-07-28 14:29:42.378362+09', false, NULL, NULL, 1, '2881a01f-1eed-4343-b0d1-5d8d22f6744a', 'USER', 'PRIVATE', false);
INSERT INTO public.personal_test_process_flows (id, workspace_id, name, flow_data, created_by, created_at, updated_at, is_published, published_at, publish_token, current_version, data_source_id, scope_type, visibility_scope, shared_with_workspace) VALUES ('647158a3-83f7-4bd0-ae88-043db7dc6e0d', '21ee03db-90c4-4592-b00f-c44801e0b164', '1239', '{"edges": [{"id": "reactflow__edge-COMMON_1752205078616-COMMON_1752205092039", "data": {"type": "smoothstep"}, "type": "smoothstep", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1752205078616", "target": "COMMON_1752205092039", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-COMMON_1752205092039-COMMON_1752205109863", "data": {"type": "smoothstep"}, "type": "smoothstep", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1752205092039", "target": "COMMON_1752205109863", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-COMMON_1752205109863-COMMON_1752205121567", "data": {"type": "smoothstep"}, "type": "smoothstep", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1752205109863", "target": "COMMON_1752205121567", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-COMMON_1752205121567-COMMON_1752205143391", "data": {"type": "smoothstep"}, "type": "smoothstep", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1752205121567", "target": "COMMON_1752205143391", "animated": false, "sourceHandle": null, "targetHandle": null}], "nodes": [{"id": "COMMON_1752205078616", "data": {"icon": "settings", "label": "Nitrogen Gas Compressor", "status": "STOP", "equipmentCode": "COMP-003", "equipmentName": "Nitrogen Gas Compressor", "equipmentType": "Compressor", "displayMeasurements": ["P-C01-OUT", "P-C02-OUT"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 285, "y": 120}, "selected": false, "positionAbsolute": {"x": 285, "y": 120}}, {"id": "COMMON_1752205092039", "data": {"icon": "settings", "label": "Crane Hoist Motor", "status": "STOP", "equipmentCode": "MOTOR-004", "equipmentName": "Crane Hoist Motor", "equipmentType": "Motor", "displayMeasurements": ["T-C01-OUT", "F-H01-FLOW", "T-H02-OUT", "A-002-CUR"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 690, "y": 135}, "selected": false, "positionAbsolute": {"x": 690, "y": 135}}, {"id": "COMMON_1752205109863", "data": {"icon": "settings", "label": "Painting Robot Arm 2", "status": "STOP", "equipmentCode": "ROBOT-A-02", "equipmentName": "Painting Robot Arm 2", "equipmentType": "Robot", "displayMeasurements": ["HOUR-C01", "T-C01-OUT", "LOAD-C01", "DP-F01", "F-H01-FLOW", "T-H02-OUT", "T-001-WND"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 465, "y": 435}, "selected": false, "positionAbsolute": {"x": 465, "y": 435}}, {"id": "COMMON_1752205121567", "data": {"icon": "settings", "label": "Coolant Bypass Valve", "status": "STOP", "equipmentCode": "VALVE-401", "equipmentName": "Coolant Bypass Valve", "equipmentType": "Valve", "displayMeasurements": ["P-C01-OUT", "T-C01-OUT", "T-H01-OUT", "T-H01-IN", "FILTER-DP", "A-002-CUR", "P-001-DIS", "P-004-SUC"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 855, "y": 435}, "selected": false, "positionAbsolute": {"x": 855, "y": 435}}, {"id": "COMMON_1752205143391", "data": {"icon": "settings", "label": "Secondary Heat Exchanger", "status": "STOP", "equipmentCode": "HEATEX-02", "equipmentName": "Secondary Heat Exchanger", "equipmentType": "HeatExchanger", "displayMeasurements": ["FLOW-P03", "ERR-R02", "TEMP-T01", "LVL-T01", "TEMP-RT-01", "POS-301", "POS-401", "POS-201", "LEAK-201"]}, "type": "equipment", "style": {"width": 410, "height": 530}, "width": 410, "height": 530, "dragging": false, "position": {"x": 1200, "y": 150}, "resizing": false, "selected": true, "positionAbsolute": {"x": 1200, "y": 150}}]}', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-11 12:39:27.76227+09', '2025-07-11 12:39:27.76227+09', true, '2025-07-11 12:39:56.304228+09', 'vhfAPKrpoqmPjmEKLhwEaz_X2BJQOddvDaWcOrCxZwQ', 1, '2881a01f-1eed-4343-b0d1-5d8d22f6744a', 'USER', 'PRIVATE', false);
INSERT INTO public.personal_test_process_flows (id, workspace_id, name, flow_data, created_by, created_at, updated_at, is_published, published_at, publish_token, current_version, data_source_id, scope_type, visibility_scope, shared_with_workspace) VALUES ('f0fe8cbe-4127-4321-a5b3-94cebd0866e6', '21ee03db-90c4-4592-b00f-c44801e0b164', 'upgrade_Test_New', '{"edges": [], "nodes": [{"id": "instrument_1753681054014", "data": {"label": "계측기", "nodeSize": "1", "displayMode": "simple", "gaugeConfig": {"max": 100, "min": 0, "unit": ""}, "instrumentType": "instrument", "refreshInterval": 5000, "measurementCodes": ["HOUR-C01"]}, "type": "instrument", "style": {"width": 160, "height": 80}, "width": 160, "height": 80, "dragging": false, "position": {"x": 600, "y": -15}, "selected": true, "positionAbsolute": {"x": 600, "y": -15}}, {"id": "instrument_1753681079661", "data": {"label": "계측기", "nodeSize": "1", "displayMode": "gauge", "gaugeConfig": {"max": 100, "min": 0, "unit": ""}, "instrumentType": "instrument", "refreshInterval": 5000, "measurementCodes": ["HOUR-C01"]}, "type": "instrument", "style": {"width": 160, "height": 80}, "width": 160, "height": 80, "dragging": false, "position": {"x": 885, "y": 0}, "selected": false, "positionAbsolute": {"x": 885, "y": 0}}, {"id": "instrument_1753681088797", "data": {"label": "계측기", "nodeSize": "1", "displayMode": "digital", "gaugeConfig": {"max": 100, "min": 0, "unit": ""}, "instrumentType": "instrument", "refreshInterval": 5000, "measurementCodes": ["T-C01-OUT"]}, "type": "instrument", "style": {"width": 160, "height": 80}, "width": 160, "height": 80, "dragging": false, "position": {"x": 600, "y": 150}, "selected": false, "positionAbsolute": {"x": 600, "y": 150}}, {"id": "instrument_1753681095468", "data": {"label": "계측기", "nodeSize": "1", "displayMode": "table", "gaugeConfig": {"max": 100, "min": 0, "unit": ""}, "instrumentType": "instrument", "refreshInterval": 5000, "measurementCodes": ["T-C01-OUT", "P-C02-OUT"]}, "type": "instrument", "style": {"width": 160, "height": 80}, "width": 160, "height": 80, "dragging": false, "position": {"x": 870, "y": 150}, "selected": false, "positionAbsolute": {"x": 870, "y": 150}}], "nodeSize": "1"}', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-28 14:37:45.890087+09', '2025-07-28 14:50:16.335056+09', false, NULL, NULL, 1, NULL, 'USER', 'PRIVATE', false);
INSERT INTO public.personal_test_process_flows (id, workspace_id, name, flow_data, created_by, created_at, updated_at, is_published, published_at, publish_token, current_version, data_source_id, scope_type, visibility_scope, shared_with_workspace) VALUES ('706a436f-d104-4130-aebb-288b09c9a8cb', '21ee03db-90c4-4592-b00f-c44801e0b164', 'New Process Flow', '{"edges": [], "nodes": [{"id": "table_1753867633681", "data": {"color": "#00bd42", "label": "Custom Table", "nodeSize": "2", "queryConfig": {"sql": "select *\nfrom vw_measurement_data_mock\n", "dataSourceId": "2881a01f-1eed-4343-b0d1-5d8d22f6744a", "refreshInterval": 30}, "statusRules": {"idField": "measurement_code", "lslField": "lsl", "uslField": "usl", "valueField": "measurement_value"}, "tableConfig": {"columns": [{"type": "id", "field": "measurement_code", "width": 60, "header": "ID"}, {"type": "value", "field": "measurement_value", "width": 80, "header": "Value"}, {"type": "usl", "field": "usl", "width": 60, "header": "USL"}, {"type": "lsl", "field": "lsl", "width": 60, "header": "LSL"}, {"type": "status", "field": "status", "width": 80, "header": "Status"}], "maxRows": 50, "displayMode": "table"}}, "type": "table", "style": {"width": 700, "height": 315}, "width": 700, "height": 315, "dragging": false, "position": {"x": 300, "y": 90}, "resizing": false, "selected": true, "positionAbsolute": {"x": 300, "y": 90}}], "nodeSize": "1"}', 'd65db892-9691-46e3-a2c6-d962980f2f51', '2025-07-30 18:28:50.998873+09', '2025-07-30 18:28:50.998873+09', false, NULL, NULL, 1, NULL, 'WORKSPACE', 'WORKSPACE', true);
INSERT INTO public.personal_test_process_flows (id, workspace_id, name, flow_data, created_by, created_at, updated_at, is_published, published_at, publish_token, current_version, data_source_id, scope_type, visibility_scope, shared_with_workspace) VALUES ('f3f3a3de-4f01-4536-9bb6-6f05c9f52ec3', '21ee03db-90c4-4592-b00f-c44801e0b164', 'ccccccc0715', '{"edges": [{"id": "reactflow__edge-COMMON_1752542183430-COMMON_1752542185262", "data": {"type": "step"}, "type": "step", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1752542183430", "target": "COMMON_1752542185262", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-COMMON_1752542185262-COMMON_1752542967597", "data": {"type": "step"}, "type": "step", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1752542185262", "target": "COMMON_1752542967597", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-COMMON_1752542967597-COMMON_1752546670764", "data": {"type": "smoothstep"}, "type": "smoothstep", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1752542967597", "target": "COMMON_1752546670764", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-COMMON_1752546670764-COMMON_1752546809100", "data": {"type": "step"}, "type": "step", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1752546670764", "target": "COMMON_1752546809100", "animated": false, "sourceHandle": null, "targetHandle": null}], "nodes": [{"id": "COMMON_1752542183430", "data": {"icon": "settings", "label": "Main Exhaust Fan", "status": "STOP", "nodeSize": "3", "equipmentCode": "FAN-EX-01", "equipmentName": "Main Exhaust Fan", "equipmentType": "Fan", "displayMeasurements": ["HOUR-C01", "T-C01-OUT"]}, "type": "equipment", "style": {"width": 200, "height": 270}, "width": 200, "height": 270, "dragging": false, "position": {"x": 240, "y": 75}, "resizing": false, "selected": false, "positionAbsolute": {"x": 240, "y": 75}}, {"id": "COMMON_1752542185262", "data": {"icon": "settings", "label": "Welding Robot Arm 1", "status": "STOP", "nodeSize": "3", "equipmentCode": "ROBOT-A-01", "equipmentName": "Welding Robot Arm 1", "equipmentType": "Robot", "displayMeasurements": ["HOUR-C01", "T-C01-OUT", "P-C02-OUT", "P-C03-OUT", "TORQUE-C01", "FLOW-F01", "T-H01-IN", "EFF-H02", "T-HVAC-RET", "S-002-RPM", "P-001-DIS", "P-002-SUC", "T-004-MOT", "PWR-R01"]}, "type": "equipment", "style": {"width": 545, "height": 270}, "width": 545, "height": 270, "dragging": false, "position": {"x": 825, "y": -135}, "resizing": false, "selected": false, "positionAbsolute": {"x": 825, "y": -135}}, {"id": "COMMON_1752542967597", "data": {"icon": "settings", "label": "Main Exhaust Fan", "status": "STOP", "nodeSize": "3", "equipmentCode": "FAN-EX-01", "equipmentName": "Main Exhaust Fan", "equipmentType": "Fan", "displayMeasurements": ["P-C01-OUT", "FLOW-F01", "DP-F01", "T-H01-OUT", "FILTER-DP", "S-001-RPM", "LOAD-M04"]}, "type": "equipment", "style": {"width": 200, "height": 495}, "width": 200, "height": 495, "dragging": false, "position": {"x": 840, "y": 195}, "resizing": false, "selected": false, "positionAbsolute": {"x": 840, "y": 195}}, {"id": "COMMON_1752546670764", "data": {"icon": "settings", "label": "Slurry Transfer Pump", "status": "STOP", "nodeSize": "3", "equipmentCode": "PUMP-004", "equipmentName": "Slurry Transfer Pump", "equipmentType": "Pump", "displayMeasurements": ["P-C01-OUT", "LOAD-C01", "T-H02-OUT", "S-001-RPM"]}, "type": "equipment", "style": {"width": 200, "height": 270}, "width": 200, "height": 270, "dragging": false, "position": {"x": 1335, "y": 195}, "selected": false, "positionAbsolute": {"x": 1335, "y": 195}}, {"id": "COMMON_1752546809100", "data": {"icon": "settings", "label": "Slurry Transfer Pump", "status": "STOP", "nodeSize": "3", "equipmentCode": "PUMP-004", "equipmentName": "Slurry Transfer Pump", "equipmentType": "Pump", "displayMeasurements": ["P-C01-OUT", "T-C01-OUT"]}, "type": "equipment", "style": {"width": 200, "height": 270}, "width": 200, "height": 270, "dragging": false, "position": {"x": 1335, "y": 570}, "selected": true, "positionAbsolute": {"x": 1335, "y": 570}}], "nodeSize": "3"}', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-15 10:16:48.967954+09', '2025-07-15 12:21:09.046132+09', true, '2025-07-15 11:31:39.816054+09', 'ErktoXoORhIwrxP4dJSln3Oa--edQ_9NuWWLhzUx6Hk', 5, '2881a01f-1eed-4343-b0d1-5d8d22f6744a', 'USER', 'PRIVATE', false);
INSERT INTO public.personal_test_process_flows (id, workspace_id, name, flow_data, created_by, created_at, updated_at, is_published, published_at, publish_token, current_version, data_source_id, scope_type, visibility_scope, shared_with_workspace) VALUES ('84fa268b-3ffd-4e02-92bf-4b9f563f97ab', '21ee03db-90c4-4592-b00f-c44801e0b164', 'newfor_krn', '{"edges": [{"id": "reactflow__edge-COMMON_1753868418977-COMMON_1753868428074", "data": {"type": "smoothstep"}, "type": "smoothstep", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1753868418977", "target": "COMMON_1753868428074", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-COMMON_1753868428074-instrument_1753868440913", "data": {"type": "smoothstep"}, "type": "smoothstep", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1753868428074", "target": "instrument_1753868440913", "animated": false, "sourceHandle": null, "targetHandle": null}], "nodes": [{"id": "COMMON_1753868418977", "data": {"icon": "settings", "label": "Emergency Diesel Generator", "status": "STOP", "nodeSize": "1", "equipmentCode": "GENERATOR-01", "equipmentName": "Emergency Diesel Generator", "equipmentType": "Generator", "displayMeasurements": ["T-C01-OUT", "P-C01-OUT", "OIL-C03", "P-C03-OUT"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 315, "y": 15}, "selected": false, "positionAbsolute": {"x": 315, "y": 15}}, {"id": "COMMON_1753868428074", "data": {"icon": "settings", "label": "Emergency Diesel Generator", "status": "STOP", "nodeSize": "1", "equipmentCode": "GENERATOR-01", "equipmentName": "Emergency Diesel Generator", "equipmentType": "Generator", "displayMeasurements": ["P-C01-OUT", "TORQUE-C01", "FLOW-F01", "T-H01-IN", "T-H02-IN"]}, "type": "equipment", "style": {"width": 215, "height": 275}, "width": 215, "height": 275, "dragging": false, "position": {"x": 645, "y": 15}, "resizing": false, "selected": false, "positionAbsolute": {"x": 645, "y": 15}}, {"id": "instrument_1753868440913", "data": {"color": "#6b7280", "label": "계측기", "nodeSize": "1", "measurements": [], "instrumentName": "계측기", "instrumentType": "I1", "displayMeasurements": ["LOAD-C01", "VIB-F01", "F-H01-FLOW", "T-H02-OUT", "T-001-WND", "P-001-DIS", "T-004-MOT"]}, "type": "instrument", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 300, "y": 390}, "selected": false, "positionAbsolute": {"x": 300, "y": 390}}], "nodeSize": "1"}', 'd65db892-9691-46e3-a2c6-d962980f2f51', '2025-07-30 18:41:04.085718+09', '2025-07-30 18:41:56.320255+09', true, '2025-07-30 18:41:16.762153+09', 'QnfXcQ9Shug7T8QGfEZ4UhPLYZPkRrKMQb9AA8ZIVUM', 1, '2881a01f-1eed-4343-b0d1-5d8d22f6744a', 'USER', 'PRIVATE', false);
INSERT INTO public.personal_test_process_flows (id, workspace_id, name, flow_data, created_by, created_at, updated_at, is_published, published_at, publish_token, current_version, data_source_id, scope_type, visibility_scope, shared_with_workspace) VALUES ('75a0f1b8-984e-4003-94ad-7f99a44e494f', '21ee03db-90c4-4592-b00f-c44801e0b164', 'dashboard for krn', '{"edges": [{"id": "reactflow__edge-COMMON_1753867424402-instrument_1753867433473", "data": {"type": "step"}, "type": "step", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1753867424402", "target": "instrument_1753867433473", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-instrument_1753867433473-COMMON_1753867449521", "data": {"type": "step"}, "type": "step", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "instrument_1753867433473", "target": "COMMON_1753867449521", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-COMMON_1753867449521-table_1753867446226", "data": {"type": "step"}, "type": "step", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1753867449521", "target": "table_1753867446226", "animated": false, "sourceHandle": null, "targetHandle": null}], "nodes": [{"id": "COMMON_1753867424402", "data": {"icon": "settings", "label": "Air Compressor Unit 1", "status": "STOP", "nodeSize": "1", "equipmentCode": "COMP-001", "equipmentName": "Air Compressor Unit 1", "equipmentType": "Compressor", "displayMeasurements": ["P-C01-OUT", "P-C02-OUT", "LOAD-C01", "DP-F01"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 240, "y": -45}, "selected": false, "positionAbsolute": {"x": 240, "y": -45}}, {"id": "instrument_1753867433473", "data": {"color": "#6b7280", "label": "계측기", "nodeSize": "1", "measurements": [], "instrumentName": "계측기", "instrumentType": "I1", "displayMeasurements": ["P-C01-OUT", "P-C03-OUT", "AMP-F01", "VOLT-G01", "EFF-H02"]}, "type": "instrument", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 525, "y": -45}, "selected": false, "positionAbsolute": {"x": 525, "y": -45}}, {"id": "table_1753867446226", "data": {"color": "#3b82f6", "label": "Custom Table", "nodeSize": "2", "queryConfig": {"sql": "select *\nfrom vw_measurement_data_mock", "dataSourceId": "2881a01f-1eed-4343-b0d1-5d8d22f6744a", "refreshInterval": 30}, "statusRules": {"idField": "measurement_code", "lslField": "lsl", "uslField": "usl", "valueField": "measurement_value"}, "tableConfig": {"columns": [{"type": "id", "field": "measurement_code", "width": 60, "header": "ID"}, {"type": "value", "field": "measurement_value", "width": 80, "header": "Value"}, {"type": "usl", "field": "usl", "width": 60, "header": "USL"}, {"type": "lsl", "field": "lsl", "width": 60, "header": "LSL"}, {"type": "status", "field": "status", "width": 80, "header": "Status"}], "maxRows": 50, "displayMode": "table"}}, "type": "table", "style": {"width": 745, "height": 360}, "width": 745, "height": 360, "dragging": false, "position": {"x": 240, "y": 345}, "resizing": false, "selected": false, "positionAbsolute": {"x": 240, "y": 345}}, {"id": "COMMON_1753867449521", "data": {"icon": "settings", "label": "Crane Hoist Motor", "status": "STOP", "nodeSize": "1", "equipmentCode": "MOTOR-004", "equipmentName": "Crane Hoist Motor", "equipmentType": "Motor", "displayMeasurements": ["HOUR-C01", "T-C01-OUT", "P-C03-OUT", "TORQUE-C01", "VOLT-G01"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 870, "y": -45}, "selected": false, "positionAbsolute": {"x": 870, "y": -45}}], "nodeSize": "1"}', 'd65db892-9691-46e3-a2c6-d962980f2f51', '2025-07-31 11:53:30.857711+09', '2025-07-31 11:53:30.899508+09', false, NULL, NULL, 1, NULL, 'USER', 'PRIVATE', false);
INSERT INTO public.personal_test_process_flows (id, workspace_id, name, flow_data, created_by, created_at, updated_at, is_published, published_at, publish_token, current_version, data_source_id, scope_type, visibility_scope, shared_with_workspace) VALUES ('15bdf454-ae12-4708-85ce-8c226292e92a', '21ee03db-90c4-4592-b00f-c44801e0b164', '1257', '{"edges": [{"id": "reactflow__edge-COMMON_1752206227785-COMMON_1752206229128", "data": {"type": "step"}, "type": "step", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1752206227785", "target": "COMMON_1752206229128", "animated": false, "sourceHandle": null, "targetHandle": null}], "nodes": [{"id": "COMMON_1752206227785", "data": {"icon": "settings", "label": "Main Exhaust Fan", "status": "STOP", "equipmentCode": "FAN-EX-01", "equipmentName": "Main Exhaust Fan", "equipmentType": "Fan", "displayMeasurements": ["HOUR-C01", "T-C01-OUT", "OIL-C03", "AMP-F01", "FLOW-F01", "T-H01-IN"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 585, "y": 225}, "selected": false}, {"id": "COMMON_1752206229128", "data": {"icon": "settings", "label": "Welding Robot Arm 1", "status": "STOP", "equipmentCode": "ROBOT-A-01", "equipmentName": "Welding Robot Arm 1", "equipmentType": "Robot", "displayMeasurements": ["HOUR-C01", "T-C01-OUT", "P-C01-OUT", "P-C02-OUT", "T-C02-OUT", "OIL-C03", "P-C03-OUT", "LOAD-C01", "SPD-C01"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 885, "y": 225}, "selected": false, "positionAbsolute": {"x": 885, "y": 225}}, {"id": "text_1752207336191", "data": {"text": "Text", "color": "#000000", "fontSize": 14}, "type": "text", "width": 50, "height": 37, "dragging": false, "position": {"x": 840, "y": 405}, "selected": true, "positionAbsolute": {"x": 840, "y": 405}}]}', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-11 12:57:36.258613+09', '2025-07-11 13:15:39.926877+09', true, '2025-07-11 12:58:14.815988+09', 'vMNI2tMPq8GUVt6aq_e6spc2qWYjPs9pNN19ffLdZ1g', 1, '2881a01f-1eed-4343-b0d1-5d8d22f6744a', 'USER', 'PRIVATE', false);
INSERT INTO public.personal_test_process_flows (id, workspace_id, name, flow_data, created_by, created_at, updated_at, is_published, published_at, publish_token, current_version, data_source_id, scope_type, visibility_scope, shared_with_workspace) VALUES ('9c40c063-e9e4-4920-98e0-daf007abecd6', '21ee03db-90c4-4592-b00f-c44801e0b164', 'New Process Flowㅠㅠ ㅜ', '{"edges": [], "nodes": [], "nodeSize": "1"}', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-15 11:34:12.180565+09', '2025-07-15 11:34:12.180565+09', false, NULL, NULL, 1, NULL, 'USER', 'PRIVATE', false);
INSERT INTO public.personal_test_process_flows (id, workspace_id, name, flow_data, created_by, created_at, updated_at, is_published, published_at, publish_token, current_version, data_source_id, scope_type, visibility_scope, shared_with_workspace) VALUES ('922c412b-a5f6-4bcd-971f-ea86b886d862', '21ee03db-90c4-4592-b00f-c44801e0b164', 'nbnnbnnb', '{"edges": [{"id": "reactflow__edge-COMMON_1753683223733-instrument_1753683225709", "data": {"type": "step"}, "type": "step", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1753683223733", "target": "instrument_1753683225709", "animated": false, "selected": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-instrument_1753683225709-COMMON_1753685198852", "data": {"type": "step"}, "type": "step", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "instrument_1753683225709", "target": "COMMON_1753685198852", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-COMMON_1753685198852-COMMON_1753685212195", "data": {"type": "step"}, "type": "step", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1753685198852", "target": "COMMON_1753685212195", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-COMMON_1753685212195-COMMON_1753685389213", "data": {"type": "step"}, "type": "step", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1753685212195", "target": "COMMON_1753685389213", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-COMMON_1753685389213-COMMON_1753685406123", "data": {"type": "step"}, "type": "step", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1753685389213", "target": "COMMON_1753685406123", "animated": false, "sourceHandle": null, "targetHandle": null}], "nodes": [{"id": "COMMON_1753683223733", "data": {"icon": "settings", "label": "Air Compressor Unit 1", "status": "STOP", "nodeSize": "1", "equipmentCode": "COMP-001", "equipmentName": "Air Compressor Unit 1", "equipmentType": "Compressor", "displayMeasurements": ["T-C01-OUT", "T-C02-OUT", "OIL-C03", "SPD-C01"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 420, "y": 180}, "selected": false, "positionAbsolute": {"x": 420, "y": 180}}, {"id": "instrument_1753683225709", "data": {"color": "#6b7280", "label": "내꺼", "status": "STOP", "nodeSize": "1", "instrumentName": "계측기", "instrumentType": "instrument", "displayMeasurements": ["P-C01-OUT", "T-C01-OUT", "HOUR-C01", "P-C02-OUT", "LOAD-C01"]}, "type": "instrument", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 705, "y": 195}, "selected": false, "positionAbsolute": {"x": 705, "y": 195}}, {"id": "COMMON_1753685198852", "data": {"icon": "settings", "label": "Air Compressor Unit 2", "status": "STOP", "nodeSize": "1", "equipmentCode": "COMP-002", "equipmentName": "Air Compressor Unit 2", "equipmentType": "Compressor", "displayMeasurements": ["P-C01-OUT", "T-C01-OUT", "LOAD-C01"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 405, "y": 480}, "selected": false, "positionAbsolute": {"x": 405, "y": 480}}, {"id": "COMMON_1753685212195", "data": {"icon": "settings", "label": "Emergency Diesel Generator", "status": "STOP", "nodeSize": "1", "equipmentCode": "GENERATOR-01", "equipmentName": "Emergency Diesel Generator", "equipmentType": "Generator", "displayMeasurements": ["T-C01-OUT", "F-H01-FLOW", "T-H02-OUT", "A-002-CUR", "T-001-BRG"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 705, "y": 525}, "selected": false, "positionAbsolute": {"x": 705, "y": 525}}, {"id": "COMMON_1753685389213", "data": {"icon": "settings", "label": "Air Compressor Unit 1", "status": "STOP", "nodeSize": "1", "equipmentCode": "COMP-001", "equipmentName": "Air Compressor Unit 1", "equipmentType": "Compressor", "displayMeasurements": ["HOUR-C01", "T-C01-OUT", "OIL-C03", "T-HVAC-RET", "VIB-M03"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 975, "y": 540}, "selected": false, "positionAbsolute": {"x": 975, "y": 540}}, {"id": "COMMON_1753685406123", "data": {"icon": "settings", "label": "Air Compressor Unit 1", "status": "STOP", "nodeSize": "1", "equipmentCode": "COMP-001", "equipmentName": "Air Compressor Unit 1", "equipmentType": "Compressor", "displayMeasurements": ["P-C01-OUT", "TORQUE-C01", "T-H01-OUT", "T-HVAC-SUP", "LOAD-M04"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 1290, "y": 540}, "selected": false, "positionAbsolute": {"x": 1290, "y": 540}}], "nodeSize": "1"}', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-28 15:16:50.614493+09', '2025-07-28 15:50:21.987434+09', true, '2025-07-28 15:29:34.281114+09', 'Stl3Crj8gSWj5FDq1o75PQeTiFXb_kYtizTvYjGNeOE', 1, '2881a01f-1eed-4343-b0d1-5d8d22f6744a', 'USER', 'PRIVATE', false);
INSERT INTO public.personal_test_process_flows (id, workspace_id, name, flow_data, created_by, created_at, updated_at, is_published, published_at, publish_token, current_version, data_source_id, scope_type, visibility_scope, shared_with_workspace) VALUES ('408d8e72-43e1-4c36-ba93-4ca9a81fe454', '21ee03db-90c4-4592-b00f-c44801e0b164', 'dashboard for krn', '{"edges": [{"id": "reactflow__edge-COMMON_1753867424402-instrument_1753867433473", "data": {"type": "step"}, "type": "step", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1753867424402", "target": "instrument_1753867433473", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-instrument_1753867433473-COMMON_1753867449521", "data": {"type": "step"}, "type": "step", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "instrument_1753867433473", "target": "COMMON_1753867449521", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-COMMON_1753867449521-table_1753867446226", "data": {"type": "step"}, "type": "step", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1753867449521", "target": "table_1753867446226", "animated": false, "sourceHandle": null, "targetHandle": null}], "nodes": [{"id": "COMMON_1753867424402", "data": {"icon": "settings", "label": "Air Compressor Unit 1", "status": "STOP", "nodeSize": "1", "equipmentCode": "COMP-001", "equipmentName": "Air Compressor Unit 1", "equipmentType": "Compressor", "displayMeasurements": ["P-C01-OUT", "P-C02-OUT", "LOAD-C01", "DP-F01"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 240, "y": -45}, "selected": false, "positionAbsolute": {"x": 240, "y": -45}}, {"id": "instrument_1753867433473", "data": {"color": "#6b7280", "label": "계측기", "nodeSize": "1", "measurements": [], "instrumentName": "계측기", "instrumentType": "I1", "displayMeasurements": ["P-C01-OUT", "P-C03-OUT", "AMP-F01", "VOLT-G01", "EFF-H02"]}, "type": "instrument", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 525, "y": -45}, "selected": false, "positionAbsolute": {"x": 525, "y": -45}}, {"id": "table_1753867446226", "data": {"color": "#3b82f6", "label": "Custom Table", "nodeSize": "2", "queryConfig": {"sql": "select *\nfrom vw_measurement_data_mock", "dataSourceId": "2881a01f-1eed-4343-b0d1-5d8d22f6744a", "refreshInterval": 30}, "statusRules": {"idField": "measurement_code", "lslField": "lsl", "uslField": "usl", "valueField": "measurement_value"}, "tableConfig": {"columns": [{"type": "id", "field": "measurement_code", "width": 60, "header": "ID"}, {"type": "value", "field": "measurement_value", "width": 80, "header": "Value"}, {"type": "usl", "field": "usl", "width": 60, "header": "USL"}, {"type": "lsl", "field": "lsl", "width": 60, "header": "LSL"}, {"type": "status", "field": "status", "width": 80, "header": "Status"}], "maxRows": 50, "displayMode": "table"}}, "type": "table", "style": {"width": 745, "height": 360}, "width": 745, "height": 360, "dragging": false, "position": {"x": 240, "y": 345}, "resizing": false, "selected": false, "positionAbsolute": {"x": 240, "y": 345}}, {"id": "COMMON_1753867449521", "data": {"icon": "settings", "label": "Crane Hoist Motor", "status": "STOP", "nodeSize": "1", "equipmentCode": "MOTOR-004", "equipmentName": "Crane Hoist Motor", "equipmentType": "Motor", "displayMeasurements": ["HOUR-C01", "T-C01-OUT", "P-C03-OUT", "TORQUE-C01", "VOLT-G01"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 870, "y": -45}, "selected": false, "positionAbsolute": {"x": 870, "y": -45}}], "nodeSize": "1"}', 'd65db892-9691-46e3-a2c6-d962980f2f51', '2025-07-31 10:20:46.353138+09', '2025-07-31 10:28:24.501137+09', false, NULL, NULL, 1, '2881a01f-1eed-4343-b0d1-5d8d22f6744a', 'USER', 'PRIVATE', false);
INSERT INTO public.personal_test_process_flows (id, workspace_id, name, flow_data, created_by, created_at, updated_at, is_published, published_at, publish_token, current_version, data_source_id, scope_type, visibility_scope, shared_with_workspace) VALUES ('be280ffa-c8d4-47e4-8623-c4b6e14e72ae', '21ee03db-90c4-4592-b00f-c44801e0b164', 'Process Flow Sample', '{"edges": [{"id": "reactflow__edge-COMMON_1752207726446-COMMON_1752207860735", "data": {"type": "step"}, "type": "step", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1752207726446", "target": "COMMON_1752207860735", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-COMMON_1752207860735-COMMON_1752207870983", "data": {"type": "step"}, "type": "step", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1752207860735", "target": "COMMON_1752207870983", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-COMMON_1752207870983-COMMON_1752207876070", "data": {"type": "step"}, "type": "step", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1752207870983", "target": "COMMON_1752207876070", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-COMMON_1752207876070-COMMON_1752207884199", "data": {"type": "smoothstep"}, "type": "smoothstep", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1752207876070", "target": "COMMON_1752207884199", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-COMMON_1752207889382-COMMON_1752207892479", "data": {"type": "default"}, "type": "default", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1752207889382", "target": "COMMON_1752207892479", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-COMMON_1752207892479-COMMON_1752207894751", "data": {"type": "default"}, "type": "default", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1752207892479", "target": "COMMON_1752207894751", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-COMMON_1752207894751-COMMON_1752207912447", "data": {"type": "step"}, "type": "step", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1752207894751", "target": "COMMON_1752207912447", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-COMMON_1752207912447-COMMON_1752207919736", "data": {"type": "step"}, "type": "step", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1752207912447", "target": "COMMON_1752207919736", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-COMMON_1752207884199-COMMON_1752207889382", "data": {"type": "step"}, "type": "step", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1752207884199", "target": "COMMON_1752207889382", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-COMMON_1752208180511-COMMON_1752208187831", "data": {"type": "default"}, "type": "default", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1752208180511", "target": "COMMON_1752208187831", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-COMMON_1752208187831-COMMON_1752208192670", "data": {"type": "default"}, "type": "default", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1752208187831", "target": "COMMON_1752208192670", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-COMMON_1752208005663-COMMON_1752208012463", "data": {"type": "straight"}, "type": "straight", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1752208005663", "target": "COMMON_1752208012463", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-COMMON_1752208012463-COMMON_1752208015015", "data": {"type": "straight"}, "type": "straight", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1752208012463", "target": "COMMON_1752208015015", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-COMMON_1752208015015-COMMON_1752208043646", "data": {"type": "straight"}, "type": "straight", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1752208015015", "target": "COMMON_1752208043646", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-COMMON_1752208043646-COMMON_1752208054559", "data": {"type": "straight"}, "type": "straight", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1752208043646", "target": "COMMON_1752208054559", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-COMMON_1752208054559-COMMON_1752208063870", "data": {"type": "smoothstep"}, "type": "smoothstep", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1752208054559", "target": "COMMON_1752208063870", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-COMMON_1752208063870-COMMON_1752208078150", "data": {"type": "smoothstep"}, "type": "smoothstep", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1752208063870", "target": "COMMON_1752208078150", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-COMMON_1752208078150-COMMON_1752208080455", "data": {"type": "smoothstep"}, "type": "smoothstep", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1752208078150", "target": "COMMON_1752208080455", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-COMMON_1752208080455-COMMON_1752208066902", "data": {"type": "smoothstep"}, "type": "smoothstep", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1752208080455", "target": "COMMON_1752208066902", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-COMMON_1752208066902-COMMON_1752208070214", "data": {"type": "smoothstep"}, "type": "smoothstep", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1752208066902", "target": "COMMON_1752208070214", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-COMMON_1752208070214-COMMON_1752208073263", "data": {"type": "smoothstep"}, "type": "smoothstep", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1752208070214", "target": "COMMON_1752208073263", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-COMMON_1752208073263-COMMON_1752208082678", "data": {"type": "smoothstep"}, "type": "smoothstep", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1752208073263", "target": "COMMON_1752208082678", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-COMMON_1752208082678-COMMON_1752208085383", "data": {"type": "smoothstep"}, "type": "smoothstep", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1752208082678", "target": "COMMON_1752208085383", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-COMMON_1752208085383-COMMON_1752208087662", "data": {"type": "smoothstep"}, "type": "smoothstep", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1752208085383", "target": "COMMON_1752208087662", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-COMMON_1752208087662-COMMON_1752208075550", "data": {"type": "smoothstep"}, "type": "smoothstep", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1752208087662", "target": "COMMON_1752208075550", "animated": false, "sourceHandle": null, "targetHandle": null}], "nodes": [{"id": "COMMON_1752207726446", "data": {"icon": "settings", "label": "Air Compressor Unit 1", "status": "STOP", "equipmentCode": "COMP-001", "equipmentName": "Air Compressor Unit 1", "equipmentType": "Compressor", "displayMeasurements": ["HOUR-C01", "T-C01-OUT", "P-C02-OUT", "T-C02-OUT", "OIL-C03"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 480, "y": 285}, "selected": false, "positionAbsolute": {"x": 480, "y": 285}}, {"id": "COMMON_1752207860735", "data": {"icon": "settings", "label": "Main Conveyor Belt", "status": "STOP", "equipmentCode": "CONV-01", "equipmentName": "Main Conveyor Belt", "equipmentType": "Conveyor", "displayMeasurements": ["HOUR-C01", "T-C01-OUT"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 480, "y": 555}, "selected": false, "positionAbsolute": {"x": 480, "y": 555}}, {"id": "COMMON_1752207870983", "data": {"icon": "settings", "label": "Main Exhaust Fan", "status": "STOP", "equipmentCode": "FAN-EX-01", "equipmentName": "Main Exhaust Fan", "equipmentType": "Fan", "displayMeasurements": ["AMP-F01", "VIB-F01", "F-H01-FLOW", "VOLT-G01", "FUEL-G01"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 480, "y": 810}, "selected": false, "positionAbsolute": {"x": 480, "y": 810}}, {"id": "COMMON_1752207876070", "data": {"icon": "settings", "label": "Painting Robot Arm 2", "status": "STOP", "equipmentCode": "ROBOT-A-02", "equipmentName": "Painting Robot Arm 2", "equipmentType": "Robot", "displayMeasurements": ["HOUR-C01", "T-C01-OUT", "P-C01-OUT", "P-C02-OUT", "T-C02-OUT", "OIL-C03", "P-C03-OUT", "LOAD-C01", "SPD-C01", "TORQUE-C01", "VIB-F01", "AMP-F01", "DP-F01", "FLOW-F01", "FREQ-G01", "FUEL-G01", "VOLT-G01", "F-H01-FLOW", "T-H01-IN"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 750, "y": 285}, "selected": false, "positionAbsolute": {"x": 750, "y": 285}}, {"id": "COMMON_1752207884199", "data": {"icon": "settings", "label": "HVAC Unit - Sector 7G", "status": "STOP", "equipmentCode": "HVAC-01", "equipmentName": "HVAC Unit - Sector 7G", "equipmentType": "HVAC", "displayMeasurements": ["HOUR-C01", "P-C01-OUT", "T-HVAC-RET", "T-HVAC-SUP", "A-001-CUR", "S-001-RPM", "T-001-WND", "S-002-RPM", "TEMP-M03", "VIB-M03", "LOAD-M04", "RUNTIME-M04", "P-001-DIS", "P-001-SUC", "T-001-BRG", "V-001-AX"]}, "type": "equipment", "style": {"width": 200, "height": 425}, "width": 200, "height": 425, "dragging": false, "position": {"x": 750, "y": 555}, "resizing": false, "selected": false, "positionAbsolute": {"x": 750, "y": 555}}, {"id": "COMMON_1752207889382", "data": {"icon": "settings", "label": "Primary Heat Exchanger", "status": "STOP", "equipmentCode": "HEATEX-01", "equipmentName": "Primary Heat Exchanger", "equipmentType": "HeatExchanger", "displayMeasurements": ["HOUR-C01", "P-C02-OUT", "T-H02-OUT", "T-001-WND", "P-001-SUC", "P-004-SUC"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 1050, "y": 285}, "selected": false, "positionAbsolute": {"x": 1050, "y": 285}}, {"id": "COMMON_1752207892479", "data": {"icon": "settings", "label": "Reactor Temp Sensor", "status": "STOP", "equipmentCode": "SENSOR-T-01", "equipmentName": "Reactor Temp Sensor", "equipmentType": "Sensor", "displayMeasurements": ["HOUR-C01", "FUEL-G01", "VOLT-G01"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 1050, "y": 555}, "selected": false, "positionAbsolute": {"x": 1050, "y": 555}}, {"id": "COMMON_1752207894751", "data": {"icon": "settings", "label": "Acid Storage Tank", "status": "STOP", "equipmentCode": "TANK-CHEM-01", "equipmentName": "Acid Storage Tank", "equipmentType": "Tank", "displayMeasurements": ["HOUR-C01", "P-C01-OUT"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 1050, "y": 810}, "selected": false, "positionAbsolute": {"x": 1050, "y": 810}}, {"id": "COMMON_1752207912447", "data": {"icon": "settings", "label": "Acid Storage Tank", "status": "STOP", "equipmentCode": "TANK-CHEM-01", "equipmentName": "Acid Storage Tank", "equipmentType": "Tank", "displayMeasurements": ["POS-401", "LEAK-201", "TEMP-T01", "TEMP-RT-01", "POS-R02-X", "SPD-R01"]}, "type": "equipment", "style": {"width": 200, "height": 270}, "width": 200, "height": 270, "dragging": false, "position": {"x": 1320, "y": 285}, "selected": false, "positionAbsolute": {"x": 1320, "y": 285}}, {"id": "COMMON_1752207919736", "data": {"icon": "settings", "label": "HVAC Unit - Sector 7G", "status": "STOP", "equipmentCode": "HVAC-01", "equipmentName": "HVAC Unit - Sector 7G", "equipmentType": "HVAC", "displayMeasurements": ["HOUR-C01", "AMP-F01", "VIB-F01", "VOLT-G01", "EFF-H02", "T-HVAC-RET"]}, "type": "equipment", "style": {"width": 200, "height": 270}, "width": 200, "height": 270, "dragging": false, "position": {"x": 1320, "y": 705}, "selected": false, "positionAbsolute": {"x": 1320, "y": 705}}, {"id": "group_1752207968015", "data": {"color": "#98e1aa", "label": "B Plant", "zIndex": -4, "titleSize": 24, "titleColor": "#374151", "borderStyle": "dashed", "titlePosition": "top", "backgroundColor": "#c2e6b3", "backgroundOpacity": 10}, "type": "group", "style": {"width": 1020, "height": 1700}, "width": 1020, "height": 1700, "dragging": false, "position": {"x": 1695, "y": 180}, "resizing": false, "selected": false, "positionAbsolute": {"x": 1695, "y": 180}}, {"id": "COMMON_1752208005663", "data": {"icon": "settings", "label": "Main Conveyor Belt", "status": "STOP", "equipmentCode": "CONV-01", "equipmentName": "Main Conveyor Belt", "equipmentType": "Conveyor", "displayMeasurements": ["P-C01-OUT", "T-C01-OUT", "P-C02-OUT"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 1800, "y": 285}, "selected": false, "positionAbsolute": {"x": 1800, "y": 285}}, {"id": "COMMON_1752208012463", "data": {"icon": "settings", "label": "Main Exhaust Fan", "status": "STOP", "equipmentCode": "FAN-EX-01", "equipmentName": "Main Exhaust Fan", "equipmentType": "Fan", "displayMeasurements": ["P-C01-OUT", "P-C02-OUT", "T-C02-OUT"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 1800, "y": 581.25}, "selected": false, "positionAbsolute": {"x": 1830, "y": 735}}, {"id": "COMMON_1752208015015", "data": {"icon": "settings", "label": "Ventilation Fan Motor", "status": "STOP", "equipmentCode": "MOTOR-002", "equipmentName": "Ventilation Fan Motor", "equipmentType": "Motor", "displayMeasurements": ["HOUR-C01", "T-C01-OUT", "TORQUE-C01", "FLOW-F01", "T-H01-IN"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 1800, "y": 870}, "selected": false, "positionAbsolute": {"x": 1800, "y": 870}}, {"id": "COMMON_1752208043646", "data": {"icon": "settings", "label": "Acid Storage Tank", "status": "STOP", "equipmentCode": "TANK-CHEM-01", "equipmentName": "Acid Storage Tank", "equipmentType": "Tank", "displayMeasurements": ["P-C01-OUT", "FLOW-F01", "DP-H02", "T-H02-OUT", "A-001-CUR", "A-002-CUR", "RUNTIME-M04"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 1800, "y": 1173.75}, "selected": false, "positionAbsolute": {"x": 1815, "y": 1230}}, {"id": "COMMON_1752208054559", "data": {"icon": "settings", "label": "Tank Level Sensor", "status": "STOP", "equipmentCode": "SENSOR-L-01", "equipmentName": "Tank Level Sensor", "equipmentType": "Sensor", "displayMeasurements": ["T-H02-IN", "A-002-CUR", "P-001-SUC", "P-004-SUC", "ERR-R02"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 1800, "y": 1470}, "selected": false, "positionAbsolute": {"x": 1815, "y": 1470}}, {"id": "COMMON_1752208063870", "data": {"icon": "settings", "label": "Emergency Diesel Generator", "status": "STOP", "equipmentCode": "GENERATOR-01", "equipmentName": "Emergency Diesel Generator", "equipmentType": "Generator", "displayMeasurements": ["P-C02-OUT", "TORQUE-C01", "FREQ-G01", "T-H01-OUT", "T-H02-OUT"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 2085, "y": 285}, "selected": false, "positionAbsolute": {"x": 2085, "y": 360}}, {"id": "COMMON_1752208066902", "data": {"icon": "settings", "label": "Emergency Diesel Generator", "status": "STOP", "equipmentCode": "GENERATOR-01", "equipmentName": "Emergency Diesel Generator", "equipmentType": "Generator", "displayMeasurements": ["P-C01-OUT", "TORQUE-C01", "VOLT-G01"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 2085, "y": 585}, "selected": false, "positionAbsolute": {"x": 2085, "y": 585}}, {"id": "COMMON_1752208070214", "data": {"icon": "settings", "label": "Painting Robot Arm 2", "status": "STOP", "equipmentCode": "ROBOT-A-02", "equipmentName": "Painting Robot Arm 2", "equipmentType": "Robot", "displayMeasurements": ["P-C01-OUT", "OIL-C03", "AMP-F01", "FUEL-G01"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 2085, "y": 870}, "selected": false, "positionAbsolute": {"x": 2085, "y": 915}}, {"id": "COMMON_1752208073263", "data": {"icon": "settings", "label": "Ventilation Fan Motor", "status": "STOP", "equipmentCode": "MOTOR-002", "equipmentName": "Ventilation Fan Motor", "equipmentType": "Motor", "displayMeasurements": ["T-C01-OUT", "TORQUE-C01", "DP-F01", "F-H01-FLOW"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 2085, "y": 1162.5}, "selected": false, "positionAbsolute": {"x": 2085, "y": 1200}}, {"id": "COMMON_1752208075550", "data": {"icon": "settings", "label": "Emergency Diesel Generator", "status": "STOP", "equipmentCode": "GENERATOR-01", "equipmentName": "Emergency Diesel Generator", "equipmentType": "Generator", "displayMeasurements": ["P-C01-OUT", "AMP-F01", "T-H01-IN"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 2085, "y": 1455}, "selected": false, "positionAbsolute": {"x": 2070, "y": 1470}}, {"id": "COMMON_1752208078150", "data": {"icon": "settings", "label": "Auxiliary Feed Pump", "status": "STOP", "equipmentCode": "PUMP-002", "equipmentName": "Auxiliary Feed Pump", "equipmentType": "Pump", "displayMeasurements": ["HOUR-C01", "OIL-C03", "AMP-F01", "TORQUE-C01"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 2400, "y": 285}, "selected": false, "positionAbsolute": {"x": 2400, "y": 285}}, {"id": "COMMON_1752208080455", "data": {"icon": "settings", "label": "Main Exhaust Fan", "status": "STOP", "equipmentCode": "FAN-EX-01", "equipmentName": "Main Exhaust Fan", "equipmentType": "Fan", "displayMeasurements": ["TORQUE-C01", "SPD-C01", "LOAD-C01"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 2400, "y": 570}, "selected": false, "positionAbsolute": {"x": 2400, "y": 570}}, {"id": "COMMON_1752208082678", "data": {"icon": "settings", "label": "Agitator Motor", "status": "STOP", "equipmentCode": "MOTOR-003", "equipmentName": "Agitator Motor", "equipmentType": "Motor", "displayMeasurements": ["T-C01-OUT", "TORQUE-C01", "F-H01-FLOW", "T-H02-OUT", "A-002-CUR"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 2400, "y": 870}, "selected": false, "positionAbsolute": {"x": 2400, "y": 870}}, {"id": "COMMON_1752208085383", "data": {"icon": "settings", "label": "Acid Storage Tank", "status": "STOP", "equipmentCode": "TANK-CHEM-01", "equipmentName": "Acid Storage Tank", "equipmentType": "Tank", "displayMeasurements": ["P-C01-OUT", "AMP-F01", "VOLT-G01", "T-H02-OUT", "A-001-CUR", "VIB-M03"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 2400, "y": 1155}, "selected": false, "positionAbsolute": {"x": 2400, "y": 1155}}, {"id": "COMMON_1752208087662", "data": {"icon": "settings", "label": "Coolant Bypass Valve", "status": "STOP", "equipmentCode": "VALVE-401", "equipmentName": "Coolant Bypass Valve", "equipmentType": "Valve", "displayMeasurements": ["HOUR-C01", "P-C01-OUT", "SPD-C01", "VOLT-G01", "EFF-H02", "A-001-CUR"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 2400, "y": 1455}, "selected": false, "positionAbsolute": {"x": 2400, "y": 1455}}, {"id": "group_1752208158038", "data": {"color": "#fe9090", "label": "C Plant", "zIndex": 0, "titleSize": 14, "titleColor": "#374151", "borderStyle": "dashed", "titlePosition": "top", "backgroundColor": "#fe9fc0", "backgroundOpacity": 10}, "type": "group", "style": {"width": 1185, "height": 740}, "width": 1185, "height": 740, "dragging": false, "position": {"x": 435, "y": 1155}, "resizing": false, "selected": false, "positionAbsolute": {"x": 435, "y": 1155}}, {"id": "COMMON_1752208180511", "data": {"icon": "settings", "label": "Welding Robot Arm 1", "status": "STOP", "equipmentCode": "ROBOT-A-01", "equipmentName": "Welding Robot Arm 1", "equipmentType": "Robot", "displayMeasurements": ["HOUR-C01", "LOAD-C01", "DP-F01", "F-H01-FLOW", "T-H02-IN", "T-HVAC-SUP", "S-002-RPM", "VIB-M03", "T-001-BRG", "P-002-SUC", "T-004-MOT", "PWR-R01", "SPD-R01", "CYCLE-R02", "ERR-R02"]}, "type": "equipment", "style": {"width": 200, "height": 470}, "width": 200, "height": 470, "dragging": false, "position": {"x": 480, "y": 1260}, "resizing": false, "selected": false, "positionAbsolute": {"x": 480, "y": 1260}}, {"id": "COMMON_1752208187831", "data": {"icon": "settings", "label": "Slurry Transfer Pump", "status": "STOP", "equipmentCode": "PUMP-004", "equipmentName": "Slurry Transfer Pump", "equipmentType": "Pump", "displayMeasurements": ["HOUR-C01", "P-C02-OUT", "TORQUE-C01", "FUEL-G01", "DP-H02", "T-HVAC-RET", "VIB-M03", "P-002-DIS", "FLOW-P06"]}, "type": "equipment", "style": {"width": 200, "height": 470}, "width": 200, "height": 470, "dragging": false, "position": {"x": 810, "y": 1260}, "resizing": false, "selected": false, "positionAbsolute": {"x": 810, "y": 1260}}, {"id": "COMMON_1752208192670", "data": {"icon": "settings", "label": "Secondary Heat Exchanger", "status": "STOP", "equipmentCode": "HEATEX-02", "equipmentName": "Secondary Heat Exchanger", "equipmentType": "HeatExchanger", "displayMeasurements": ["HOUR-C01", "T-C01-OUT", "AMP-F01", "TORQUE-C01", "SPD-C01", "FREQ-G01", "FUEL-G01", "DP-H02", "T-H01-OUT", "T-H01-IN", "FILTER-DP", "T-HVAC-SUP", "S-002-RPM", "A-002-CUR", "TEMP-M03"]}, "type": "equipment", "style": {"width": 440, "height": 500}, "width": 440, "height": 500, "dragging": false, "position": {"x": 1125, "y": 1260}, "resizing": false, "selected": false, "positionAbsolute": {"x": 1125, "y": 1260}}]}', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-11 13:38:16.29969+09', '2025-07-11 13:38:34.410446+09', true, '2025-07-11 13:38:47.90786+09', 'KDPvJ1yyI7P30GHLl-PKc3aP9C3N1ROYLZM43KYPx6k', 1, '2881a01f-1eed-4343-b0d1-5d8d22f6744a', 'USER', 'PRIVATE', false);
INSERT INTO public.personal_test_process_flows (id, workspace_id, name, flow_data, created_by, created_at, updated_at, is_published, published_at, publish_token, current_version, data_source_id, scope_type, visibility_scope, shared_with_workspace) VALUES ('8c161be6-a389-4cee-981d-d04403ae75a1', '21ee03db-90c4-4592-b00f-c44801e0b164', 'dashboard for krn', '{"edges": [{"id": "reactflow__edge-COMMON_1753867424402-instrument_1753867433473", "data": {"type": "step"}, "type": "step", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1753867424402", "target": "instrument_1753867433473", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-instrument_1753867433473-COMMON_1753867449521", "data": {"type": "step"}, "type": "step", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "instrument_1753867433473", "target": "COMMON_1753867449521", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-COMMON_1753867449521-table_1753867446226", "data": {"type": "step"}, "type": "step", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1753867449521", "target": "table_1753867446226", "animated": false, "sourceHandle": null, "targetHandle": null}], "nodes": [{"id": "COMMON_1753867424402", "data": {"icon": "settings", "label": "Air Compressor Unit 1", "status": "STOP", "nodeSize": "1", "equipmentCode": "COMP-001", "equipmentName": "Air Compressor Unit 1", "equipmentType": "Compressor", "displayMeasurements": ["P-C01-OUT", "P-C02-OUT", "LOAD-C01", "DP-F01"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 240, "y": -45}, "selected": false, "positionAbsolute": {"x": 240, "y": -45}}, {"id": "instrument_1753867433473", "data": {"color": "#6b7280", "label": "계측기", "nodeSize": "1", "measurements": [], "instrumentName": "계측기", "instrumentType": "I1", "displayMeasurements": ["P-C01-OUT", "P-C03-OUT", "AMP-F01", "VOLT-G01", "EFF-H02"]}, "type": "instrument", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 525, "y": -45}, "selected": false, "positionAbsolute": {"x": 525, "y": -45}}, {"id": "table_1753867446226", "data": {"color": "#3b82f6", "label": "Custom Table", "nodeSize": "2", "queryConfig": {"sql": "select *\nfrom vw_measurement_data_mock", "dataSourceId": "2881a01f-1eed-4343-b0d1-5d8d22f6744a", "refreshInterval": 30}, "statusRules": {"idField": "measurement_code", "lslField": "lsl", "uslField": "usl", "valueField": "measurement_value"}, "tableConfig": {"columns": [{"type": "id", "field": "measurement_code", "width": 60, "header": "ID"}, {"type": "value", "field": "measurement_value", "width": 80, "header": "Value"}, {"type": "usl", "field": "usl", "width": 60, "header": "USL"}, {"type": "lsl", "field": "lsl", "width": 60, "header": "LSL"}, {"type": "status", "field": "status", "width": 80, "header": "Status"}], "maxRows": 50, "displayMode": "table"}}, "type": "table", "style": {"width": 745, "height": 360}, "width": 745, "height": 360, "dragging": false, "position": {"x": 240, "y": 345}, "resizing": false, "selected": false, "positionAbsolute": {"x": 240, "y": 345}}, {"id": "COMMON_1753867449521", "data": {"icon": "settings", "label": "Crane Hoist Motor", "status": "STOP", "nodeSize": "1", "equipmentCode": "MOTOR-004", "equipmentName": "Crane Hoist Motor", "equipmentType": "Motor", "displayMeasurements": ["HOUR-C01", "T-C01-OUT", "P-C03-OUT", "TORQUE-C01", "VOLT-G01"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 870, "y": -45}, "selected": false, "positionAbsolute": {"x": 870, "y": -45}}], "nodeSize": "1"}', 'd65db892-9691-46e3-a2c6-d962980f2f51', '2025-07-31 11:54:16.274092+09', '2025-07-31 11:54:16.311863+09', false, NULL, NULL, 1, NULL, 'USER', 'PRIVATE', false);
INSERT INTO public.personal_test_process_flows (id, workspace_id, name, flow_data, created_by, created_at, updated_at, is_published, published_at, publish_token, current_version, data_source_id, scope_type, visibility_scope, shared_with_workspace) VALUES ('98873391-2046-4c29-9aae-099d03dc4eed', '21ee03db-90c4-4592-b00f-c44801e0b164', 'New Process Flow', '{"edges": [], "nodes": []}', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-14 16:43:30.276851+09', '2025-07-14 16:43:30.276851+09', false, NULL, NULL, 1, NULL, 'USER', 'PRIVATE', false);
INSERT INTO public.personal_test_process_flows (id, workspace_id, name, flow_data, created_by, created_at, updated_at, is_published, published_at, publish_token, current_version, data_source_id, scope_type, visibility_scope, shared_with_workspace) VALUES ('74795e1b-5148-460b-9068-2ecbbc2099aa', '21ee03db-90c4-4592-b00f-c44801e0b164', 'krnkrn_new', '{"edges": [{"id": "reactflow__edge-COMMON_1753867424402-instrument_1753867433473", "data": {"type": "step"}, "type": "step", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1753867424402", "target": "instrument_1753867433473", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-instrument_1753867433473-COMMON_1753867449521", "data": {"type": "step"}, "type": "step", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "instrument_1753867433473", "target": "COMMON_1753867449521", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-COMMON_1753867449521-table_1753867446226", "data": {"type": "step"}, "type": "step", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1753867449521", "target": "table_1753867446226", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-table_1753867446226-table_1753930758185", "data": {"type": "step"}, "type": "step", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "table_1753867446226", "target": "table_1753930758185", "animated": false, "sourceHandle": null, "targetHandle": null}], "nodes": [{"id": "COMMON_1753867424402", "data": {"icon": "settings", "label": "Air Compressor Unit 1", "status": "STOP", "nodeSize": "1", "equipmentCode": "COMP-001", "equipmentName": "Air Compressor Unit 1", "equipmentType": "Compressor", "displayMeasurements": ["P-C01-OUT", "P-C02-OUT", "LOAD-C01", "DP-F01"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 240, "y": -45}, "selected": false, "positionAbsolute": {"x": 240, "y": -45}}, {"id": "instrument_1753867433473", "data": {"color": "#6b7280", "label": "계측기", "nodeSize": "1", "measurements": [], "instrumentName": "계측기", "instrumentType": "I1", "displayMeasurements": ["P-C01-OUT", "P-C03-OUT", "AMP-F01", "VOLT-G01", "EFF-H02"]}, "type": "instrument", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 525, "y": -45}, "selected": false, "positionAbsolute": {"x": 525, "y": -45}}, {"id": "table_1753867446226", "data": {"color": "#3b82f6", "label": "Custom Table", "nodeSize": "2", "queryConfig": {"sql": "select *\nfrom vw_measurement_data_mock", "dataSourceId": "2881a01f-1eed-4343-b0d1-5d8d22f6744a", "refreshInterval": 30}, "statusRules": {"idField": "measurement_code", "lslField": "lsl", "uslField": "usl", "valueField": "measurement_value"}, "tableConfig": {"columns": [{"type": "id", "field": "measurement_code", "width": 60, "header": "ID"}, {"type": "value", "field": "measurement_value", "width": 80, "header": "Value"}, {"type": "usl", "field": "usl", "width": 60, "header": "USL"}, {"type": "lsl", "field": "lsl", "width": 60, "header": "LSL"}, {"type": "status", "field": "status", "width": 80, "header": "Status"}], "maxRows": 50, "displayMode": "table"}}, "type": "table", "style": {"width": 745, "height": 360}, "width": 745, "height": 360, "dragging": false, "position": {"x": 240, "y": 345}, "resizing": false, "selected": false, "positionAbsolute": {"x": 240, "y": 345}}, {"id": "COMMON_1753867449521", "data": {"icon": "settings", "label": "Crane Hoist Motor", "status": "STOP", "nodeSize": "1", "equipmentCode": "MOTOR-004", "equipmentName": "Crane Hoist Motor", "equipmentType": "Motor", "displayMeasurements": ["HOUR-C01", "T-C01-OUT", "P-C03-OUT", "TORQUE-C01", "VOLT-G01"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 870, "y": -45}, "selected": false, "positionAbsolute": {"x": 870, "y": -45}}, {"id": "table_1753930758185", "data": {"color": "#3b82f6", "label": "Custom Table", "nodeSize": "2", "queryConfig": {"sql": "select *\nfrom vw_measurement_data_mock\nwhere 1=1 and measurement_code = ''P-C01-OUT''\n\n", "dataSourceId": "2881a01f-1eed-4343-b0d1-5d8d22f6744a", "refreshInterval": 30}, "statusRules": {"idField": "measurement_code", "lslField": "lsl", "uslField": "usl", "valueField": "measurement_value"}, "tableConfig": {"columns": [{"type": "id", "field": "measurement_code", "width": 80, "header": "ID"}, {"type": "value", "field": "measurement_value", "width": 77, "header": "Value"}, {"type": "usl", "field": "usl", "width": 60, "header": "USL"}, {"type": "lsl", "field": "lsl", "width": 60, "header": "LSL"}, {"type": "status", "field": "status", "width": 60, "header": "Status"}], "maxRows": 50, "displayMode": "table"}}, "type": "table", "style": {"width": 460, "height": 425}, "width": 460, "height": 425, "dragging": false, "position": {"x": 1305, "y": 360}, "resizing": false, "selected": true, "positionAbsolute": {"x": 1305, "y": 360}}], "nodeSize": "1"}', 'd65db892-9691-46e3-a2c6-d962980f2f51', '2025-07-31 11:58:55.918376+09', '2025-07-31 12:01:57.522352+09', false, NULL, NULL, 1, '2881a01f-1eed-4343-b0d1-5d8d22f6744a', 'USER', 'PRIVATE', false);
INSERT INTO public.personal_test_process_flows (id, workspace_id, name, flow_data, created_by, created_at, updated_at, is_published, published_at, publish_token, current_version, data_source_id, scope_type, visibility_scope, shared_with_workspace) VALUES ('84fbcc49-a747-442e-b67d-2191d7e46559', '21ee03db-90c4-4592-b00f-c44801e0b164', '4535434543', '{"edges": [], "nodes": [{"id": "COMMON_1752479477696", "data": {"icon": "settings", "label": "공통설비", "status": "STOP", "equipmentCode": "", "equipmentName": "공통설비", "equipmentType": "COMMON", "displayMeasurements": ["HOUR-C01", "P-C01-OUT", "T-C01-OUT", "OIL-C03", "F-H01-FLOW", "EFF-H02", "FILTER-DP", "S-001-RPM"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 465, "y": 210}, "selected": false}]}', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-14 16:52:16.61694+09', '2025-07-14 16:52:16.61694+09', false, NULL, NULL, 1, '2881a01f-1eed-4343-b0d1-5d8d22f6744a', 'USER', 'PRIVATE', false);
INSERT INTO public.personal_test_process_flows (id, workspace_id, name, flow_data, created_by, created_at, updated_at, is_published, published_at, publish_token, current_version, data_source_id, scope_type, visibility_scope, shared_with_workspace) VALUES ('d928f732-cb8a-4893-a42e-eca706f9588a', '21ee03db-90c4-4592-b00f-c44801e0b164', 'New Process Flow', '{"edges": [], "nodes": [{"id": "table_1753780319725", "data": {"color": "#3b82f6", "label": "Custom Table", "nodeSize": "2", "queryConfig": {"sql": "select *\nfrom vw_measurement_data_mock\n", "dataSourceId": "2881a01f-1eed-4343-b0d1-5d8d22f6744a", "refreshInterval": 30}, "statusRules": {"idField": "measurement_code", "lslField": "lsl", "uslField": "usl", "valueField": " measurement_value"}, "tableConfig": {"columns": [{"type": "id", "field": "measurement_code", "width": 60, "header": "ID"}, {"type": "value", "field": " measurement_value", "width": 80, "header": "Value"}, {"type": "usl", "field": "usl", "width": 60, "header": "USL"}, {"type": "lsl", "field": "lsl", "width": 60, "header": "LSL"}, {"type": "status", "field": "spec_status", "width": 80, "header": "Status"}, {"type": "text", "field": "measurement_desc", "width": 80, "header": "DESC"}], "maxRows": 50, "displayMode": "table"}}, "type": "table", "style": {"width": 400, "height": 300}, "width": 400, "height": 300, "dragging": false, "position": {"x": 675, "y": 270}, "selected": true, "positionAbsolute": {"x": 675, "y": 270}}], "nodeSize": "1"}', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-30 07:39:01.415339+09', '2025-07-30 07:39:01.415339+09', false, NULL, NULL, 1, '2881a01f-1eed-4343-b0d1-5d8d22f6744a', 'USER', 'PRIVATE', false);
INSERT INTO public.personal_test_process_flows (id, workspace_id, name, flow_data, created_by, created_at, updated_at, is_published, published_at, publish_token, current_version, data_source_id, scope_type, visibility_scope, shared_with_workspace) VALUES ('d0e8c718-c4db-46e4-83ee-75ba1543a16a', '21ee03db-90c4-4592-b00f-c44801e0b164', 'New Process Flow', '{"edges": [], "nodes": [{"id": "table_1753828769217", "data": {"color": "#3b82f6", "label": "Custom Table", "nodeSize": "2", "queryConfig": {"sql": "select *\nfrom vw_measurement_data_mock\n", "dataSourceId": "2881a01f-1eed-4343-b0d1-5d8d22f6744a", "refreshInterval": 30}, "statusRules": {"idField": "id", "lslField": "lsl", "uslField": "usl", "valueField": "value"}, "tableConfig": {"columns": [{"type": "id", "field": "id", "width": 60, "header": "ID"}, {"type": "value", "field": "value", "width": 80, "header": "Value"}, {"type": "usl", "field": "usl", "width": 60, "header": "USL"}, {"type": "lsl", "field": "lsl", "width": 60, "header": "LSL"}, {"type": "status", "field": "status", "width": 80, "header": "Status"}], "maxRows": 50, "displayMode": "table"}}, "type": "table", "style": {"width": 400, "height": 300}, "width": 400, "height": 300, "dragging": false, "position": {"x": 615, "y": 240}, "selected": true, "positionAbsolute": {"x": 615, "y": 240}}], "nodeSize": "1"}', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-30 07:40:03.958629+09', '2025-07-30 07:40:03.958629+09', false, NULL, NULL, 1, '2881a01f-1eed-4343-b0d1-5d8d22f6744a', 'USER', 'PRIVATE', false);
INSERT INTO public.personal_test_process_flows (id, workspace_id, name, flow_data, created_by, created_at, updated_at, is_published, published_at, publish_token, current_version, data_source_id, scope_type, visibility_scope, shared_with_workspace) VALUES ('d501f61e-b744-457c-bbeb-7cfe4b43e4d3', '21ee03db-90c4-4592-b00f-c44801e0b164', 'vcxvzxcv', '{"edges": [], "nodes": [{"id": "COMMON_1752479599249", "data": {"icon": "settings", "label": "Main Conveyor Belt", "status": "STOP", "equipmentCode": "CONV-01", "equipmentName": "Main Conveyor Belt", "equipmentType": "Conveyor", "displayMeasurements": ["P-C01-OUT", "HOUR-C01", "DP-F01", "T-C01-OUT", "P-C02-OUT", "OIL-C03"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 450, "y": 120}, "resizing": false, "selected": true, "positionAbsolute": {"x": 450, "y": 120}}]}', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-14 16:56:16.840957+09', '2025-07-14 17:02:00.304339+09', false, NULL, NULL, 1, NULL, 'USER', 'PRIVATE', false);
INSERT INTO public.personal_test_process_flows (id, workspace_id, name, flow_data, created_by, created_at, updated_at, is_published, published_at, publish_token, current_version, data_source_id, scope_type, visibility_scope, shared_with_workspace) VALUES ('4981792c-c362-4a2a-8044-4e0f824d9957', '21ee03db-90c4-4592-b00f-c44801e0b164', 'zxczxczxc', '{"edges": [], "nodes": [{"id": "COMMON_1752481502856", "data": {"icon": "settings", "label": "Emergency Diesel Generator", "status": "STOP", "nodeSize": "3", "equipmentCode": "GENERATOR-01", "equipmentName": "Emergency Diesel Generator", "equipmentType": "Generator", "displayMeasurements": ["P-C01-OUT", "P-C02-OUT", "T-C01-OUT", "T-C02-OUT", "P-C03-OUT", "OIL-C03", "LOAD-C01", "SPD-C01"]}, "type": "equipment", "style": {"width": 200, "height": 270}, "width": 200, "height": 270, "dragging": false, "position": {"x": 585, "y": 165}, "selected": false}], "nodeSize": "3"}', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-14 17:26:08.313715+09', '2025-07-14 17:26:08.313715+09', false, NULL, NULL, 1, '2881a01f-1eed-4343-b0d1-5d8d22f6744a', 'USER', 'PRIVATE', false);
INSERT INTO public.personal_test_process_flows (id, workspace_id, name, flow_data, created_by, created_at, updated_at, is_published, published_at, publish_token, current_version, data_source_id, scope_type, visibility_scope, shared_with_workspace) VALUES ('9cff84af-5463-4328-9ec1-c027fb3909ed', '21ee03db-90c4-4592-b00f-c44801e0b164', 'New Process Flow', '{"edges": [], "nodes": [{"id": "table_1753828812474", "data": {"color": "#3b82f6", "label": "Custom Table", "nodeSize": "2", "queryConfig": {"sql": "", "dataSourceId": "", "refreshInterval": 30}, "statusRules": {"idField": "id", "lslField": "lsl", "uslField": "usl", "valueField": "value"}, "tableConfig": {"columns": [{"type": "id", "field": "id", "width": 60, "header": "ID"}, {"type": "value", "field": "value", "width": 80, "header": "Value"}, {"type": "usl", "field": "usl", "width": 60, "header": "USL"}, {"type": "lsl", "field": "lsl", "width": 60, "header": "LSL"}, {"type": "status", "field": "status", "width": 80, "header": "Status"}], "maxRows": 50, "displayMode": "table"}}, "type": "table", "style": {"width": 400, "height": 300}, "width": 400, "height": 300, "position": {"x": 690, "y": 285}}], "nodeSize": "1"}', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-30 07:40:24.216443+09', '2025-07-30 07:40:24.216443+09', false, NULL, NULL, 1, '2881a01f-1eed-4343-b0d1-5d8d22f6744a', 'USER', 'PRIVATE', false);
INSERT INTO public.personal_test_process_flows (id, workspace_id, name, flow_data, created_by, created_at, updated_at, is_published, published_at, publish_token, current_version, data_source_id, scope_type, visibility_scope, shared_with_workspace) VALUES ('3d177b8d-8972-4545-aa74-4bb4d109d905', '21ee03db-90c4-4592-b00f-c44801e0b164', 'asdfasdf', '{"edges": [], "nodes": [{"id": "COMMON_1752536721471", "data": {"icon": "settings", "label": "Air Compressor Unit 1", "status": "STOP", "nodeSize": "3", "equipmentCode": "COMP-001", "equipmentName": "Air Compressor Unit 1", "equipmentType": "Compressor", "displayMeasurements": ["HOUR-C01", "P-C01-OUT", "T-C01-OUT", "P-C02-OUT", "T-C02-OUT"]}, "type": "equipment", "style": {"width": 215, "height": 270}, "width": 215, "height": 270, "dragging": false, "position": {"x": 540, "y": 150}, "resizing": false, "selected": false, "positionAbsolute": {"x": 540, "y": 150}}], "nodeSize": "3"}', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-15 08:52:11.397884+09', '2025-07-15 08:52:11.397884+09', false, NULL, NULL, 1, NULL, 'USER', 'PRIVATE', false);
INSERT INTO public.personal_test_process_flows (id, workspace_id, name, flow_data, created_by, created_at, updated_at, is_published, published_at, publish_token, current_version, data_source_id, scope_type, visibility_scope, shared_with_workspace) VALUES ('973c6e4d-6e42-4c15-8fdb-20f31518ac51', '21ee03db-90c4-4592-b00f-c44801e0b164', 'New Process Flow', '{"edges": [], "nodes": [{"id": "table_1753837382360", "data": {"color": "#3b82f6", "label": "Custom Table", "nodeSize": "2", "queryConfig": {"sql": "select *\nfrom vw_measurement_data_mock\n", "dataSourceId": "2881a01f-1eed-4343-b0d1-5d8d22f6744a", "refreshInterval": 30}, "statusRules": {"idField": "id", "lslField": "lsl", "uslField": "usl", "valueField": "value"}, "tableConfig": {"columns": [{"type": "id", "field": "id", "width": 60, "header": "ID"}, {"type": "value", "field": "value", "width": 80, "header": "Value"}, {"type": "usl", "field": "usl", "width": 60, "header": "USL"}, {"type": "lsl", "field": "lsl", "width": 60, "header": "LSL"}, {"type": "status", "field": "status", "width": 80, "header": "Status"}], "maxRows": 50, "displayMode": "table"}}, "type": "table", "style": {"width": 400, "height": 300}, "width": 400, "height": 300, "dragging": false, "position": {"x": 840, "y": 330}, "selected": true}], "nodeSize": "1"}', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-30 10:03:28.578175+09', '2025-07-30 10:03:28.578175+09', false, NULL, NULL, 1, '2881a01f-1eed-4343-b0d1-5d8d22f6744a', 'USER', 'PRIVATE', false);
INSERT INTO public.personal_test_process_flows (id, workspace_id, name, flow_data, created_by, created_at, updated_at, is_published, published_at, publish_token, current_version, data_source_id, scope_type, visibility_scope, shared_with_workspace) VALUES ('44254471-ea40-4866-9330-6012406e8cff', '21ee03db-90c4-4592-b00f-c44801e0b164', 'nt', '{"edges": [{"id": "reactflow__edge-COMMON_1752036246531-COMMON_1752036259739", "data": {"type": "step"}, "type": "step", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1752036246531", "target": "COMMON_1752036259739", "animated": false, "sourceHandle": null, "targetHandle": null}], "nodes": [{"id": "COMMON_1752036246531", "data": {"icon": "settings", "label": "Primary Heat Exchanger", "status": "STOP", "equipmentCode": "HEATEX-01", "equipmentName": "Primary Heat Exchanger", "equipmentType": "HeatExchanger", "displayMeasurements": ["HOUR-C01", "LOAD-C01", "FREQ-G01"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 765, "y": 120}, "selected": false, "positionAbsolute": {"x": 765, "y": 120}}, {"id": "COMMON_1752036259739", "data": {"icon": "settings", "label": "Tank Level Sensor", "status": "STOP", "equipmentCode": "SENSOR-L-01", "equipmentName": "Tank Level Sensor", "equipmentType": "Sensor", "displayMeasurements": ["P-C01-OUT", "T-004-MOT", "PRES-S01", "SPD-C01"]}, "type": "equipment", "style": {"width": 200, "height": 270}, "width": 200, "height": 270, "dragging": false, "position": {"x": 1080, "y": 90}, "selected": true, "positionAbsolute": {"x": 1080, "y": 90}}]}', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-09 13:44:40.606627+09', '2025-07-10 08:39:00.393476+09', true, '2025-07-09 15:16:48.055346+09', 'zK62ELnYQtkw7lm4yoQAjk94DzdfACWhhGR-db86oto', 1, '2881a01f-1eed-4343-b0d1-5d8d22f6744a', 'USER', 'PRIVATE', false);
INSERT INTO public.personal_test_process_flows (id, workspace_id, name, flow_data, created_by, created_at, updated_at, is_published, published_at, publish_token, current_version, data_source_id, scope_type, visibility_scope, shared_with_workspace) VALUES ('e0c49961-d132-46a6-8069-91dd4ef5eb62', '21ee03db-90c4-4592-b00f-c44801e0b164', 'aaaaaa0715', '{"edges": [{"id": "reactflow__edge-COMMON_1752539425575-COMMON_1752539826999", "data": {"type": "straight"}, "type": "straight", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1752539425575", "target": "COMMON_1752539826999", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-COMMON_1752539794270-COMMON_1752539838935", "data": {"type": "step"}, "type": "step", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1752539794270", "target": "COMMON_1752539838935", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-COMMON_1752539826999-COMMON_1752539794270", "data": {"type": "smoothstep"}, "type": "smoothstep", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1752539826999", "target": "COMMON_1752539794270", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-COMMON_1752539838935-COMMON_1752539805670", "data": {"type": "default"}, "type": "default", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1752539838935", "target": "COMMON_1752539805670", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-COMMON_1752539805670-COMMON_1752539870718", "data": {"type": "default"}, "type": "default", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1752539805670", "target": "COMMON_1752539870718", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-COMMON_1752539870718-COMMON_1752539885190", "data": {"type": "step"}, "type": "step", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1752539870718", "target": "COMMON_1752539885190", "animated": false, "sourceHandle": null, "targetHandle": null}], "nodes": [{"id": "COMMON_1752539425575", "data": {"icon": "settings", "label": "Main Conveyor Belt", "status": "STOP", "nodeSize": "3", "equipmentCode": "CONV-01", "equipmentName": "Main Conveyor Belt", "equipmentType": "Conveyor", "displayMeasurements": ["P-C01-OUT", "T-C01-OUT", "HOUR-C01", "P-C02-OUT"]}, "type": "equipment", "style": {"width": 200, "height": 270}, "width": 200, "height": 270, "dragging": false, "position": {"x": -210, "y": -15}, "resizing": false, "selected": false, "positionAbsolute": {"x": -210, "y": -15}}, {"id": "COMMON_1752539794270", "data": {"icon": "settings", "label": "Emergency Diesel Generator", "status": "STOP", "nodeSize": "3", "equipmentCode": "GENERATOR-01", "equipmentName": "Emergency Diesel Generator", "equipmentType": "Generator", "displayMeasurements": ["HOUR-C01", "T-C01-OUT", "SPD-C01", "LOAD-C01", "TORQUE-C01", "VIB-F01"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 570, "y": 15}, "selected": false, "positionAbsolute": {"x": 570, "y": 15}}, {"id": "COMMON_1752539805670", "data": {"icon": "settings", "label": "Air Compressor Unit 2", "status": "STOP", "nodeSize": "3", "equipmentCode": "COMP-002", "equipmentName": "Air Compressor Unit 2", "equipmentType": "Compressor", "displayMeasurements": ["HOUR-C01", "T-C01-OUT", "LOAD-C01", "P-C03-OUT"]}, "type": "equipment", "style": {"width": 200, "height": 270}, "width": 200, "height": 270, "dragging": false, "position": {"x": 855, "y": 0}, "selected": false, "positionAbsolute": {"x": 855, "y": 0}}, {"id": "COMMON_1752539826999", "data": {"icon": "settings", "label": "Reactor Temp Sensor", "status": "STOP", "nodeSize": "3", "equipmentCode": "SENSOR-T-01", "equipmentName": "Reactor Temp Sensor", "equipmentType": "Sensor", "displayMeasurements": ["HOUR-C01"]}, "type": "equipment", "style": {"width": 200, "height": 255}, "width": 200, "height": 255, "dragging": false, "position": {"x": 0, "y": 300}, "resizing": false, "selected": false, "positionAbsolute": {"x": 0, "y": 300}}, {"id": "COMMON_1752539838935", "data": {"icon": "settings", "label": "Emergency Diesel Generator", "status": "STOP", "nodeSize": "3", "equipmentCode": "GENERATOR-01", "equipmentName": "Emergency Diesel Generator", "equipmentType": "Generator", "displayMeasurements": ["T-C01-OUT", "LOAD-C01", "FLOW-F01", "DP-H02", "HUMID-HVAC", "A-002-CUR", "RUNTIME-M04", "P-002-DIS", "PRES-P05", "POS-R02-X", "DP-101", "TEMP-T01", "POS-301"]}, "type": "equipment", "style": {"width": 215, "height": 860}, "width": 215, "height": 860, "dragging": false, "position": {"x": 600, "y": 360}, "resizing": false, "selected": false, "positionAbsolute": {"x": 600, "y": 360}}, {"id": "COMMON_1752539870718", "data": {"icon": "settings", "label": "Main Conveyor Belt", "status": "STOP", "nodeSize": "3", "equipmentCode": "CONV-01", "equipmentName": "Main Conveyor Belt", "equipmentType": "Conveyor", "displayMeasurements": ["P-C01-OUT", "T-C01-OUT", "LOAD-C01", "DP-F01"]}, "type": "equipment", "style": {"width": 545, "height": 120}, "width": 545, "height": 120, "dragging": false, "position": {"x": 855, "y": 345}, "resizing": false, "selected": false, "positionAbsolute": {"x": 855, "y": 345}}, {"id": "COMMON_1752539885190", "data": {"icon": "settings", "label": "Acid Storage Tank", "status": "STOP", "nodeSize": "3", "equipmentCode": "TANK-CHEM-01", "equipmentName": "Acid Storage Tank", "equipmentType": "Tank", "displayMeasurements": ["HOUR-C01", "T-C01-OUT", "T-C02-OUT", "SPD-C01", "VOLT-G01", "T-H02-OUT", "S-001-RPM", "RUNTIME-M04"]}, "type": "equipment", "style": {"width": 575, "height": 315}, "width": 575, "height": 315, "dragging": false, "position": {"x": 885, "y": 630}, "resizing": false, "selected": true, "positionAbsolute": {"x": 885, "y": 630}}, {"id": "text_1752539902086", "data": {"text": "너는 노드야.", "color": "#000000", "padding": 8, "fontSize": 100, "textAlign": "center", "fontWeight": "normal", "borderColor": "#999999", "borderStyle": "none", "borderWidth": 1, "backgroundColor": "#ffffff"}, "type": "text", "width": 573, "height": 166, "dragging": false, "position": {"x": -450, "y": 600}, "selected": false, "positionAbsolute": {"x": -450, "y": 600}}, {"id": "group_1752539919102", "data": {"color": "#6b7280", "label": "Group", "zIndex": -10, "titleSize": 14, "titleColor": "#374151", "borderStyle": "dashed", "titlePosition": "top", "backgroundColor": "#6b7280", "backgroundOpacity": 10}, "type": "group", "style": {"width": 300, "height": 200}, "width": 300, "height": 200, "dragging": false, "position": {"x": 255, "y": 645}, "selected": false, "positionAbsolute": {"x": 255, "y": 645}}], "nodeSize": "3"}', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-15 09:39:32.119767+09', '2025-07-15 10:00:07.669219+09', false, NULL, NULL, 1, NULL, 'USER', 'PRIVATE', false);


--
-- TOC entry 5300 (class 0 OID 20182)
-- Dependencies: 239
-- Data for Name: status_mappings; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.status_mappings (id, workspace_id, source_status, target_status, data_source_type, is_active, created_at, updated_at) VALUES ('97b71809-92b8-46cd-920d-de96c7231e3d', '21ee03db-90c4-4592-b00f-c44801e0b164', 'Running', 'ACTIVE', 'mssql', true, '2025-07-09 09:23:00.254428', '2025-07-09 09:23:00.254428');
INSERT INTO public.status_mappings (id, workspace_id, source_status, target_status, data_source_type, is_active, created_at, updated_at) VALUES ('630b63df-d19a-4d6a-b080-3aa4aa1310b0', '21ee03db-90c4-4592-b00f-c44801e0b164', 'Run', 'ACTIVE', 'mssql', true, '2025-07-09 09:23:00.254428', '2025-07-09 09:23:00.254428');
INSERT INTO public.status_mappings (id, workspace_id, source_status, target_status, data_source_type, is_active, created_at, updated_at) VALUES ('f6d9248c-aba6-40de-b9c9-344be26f38b5', '21ee03db-90c4-4592-b00f-c44801e0b164', 'Stopped', 'STOP', 'mssql', true, '2025-07-09 09:23:00.254428', '2025-07-09 09:23:00.254428');
INSERT INTO public.status_mappings (id, workspace_id, source_status, target_status, data_source_type, is_active, created_at, updated_at) VALUES ('da7f0586-301c-4933-b94d-c99830b81227', '21ee03db-90c4-4592-b00f-c44801e0b164', 'Idle', 'PAUSE', 'mssql', true, '2025-07-09 09:23:00.254428', '2025-07-09 09:23:00.254428');
INSERT INTO public.status_mappings (id, workspace_id, source_status, target_status, data_source_type, is_active, created_at, updated_at) VALUES ('e7f9fb33-0e49-4de0-b37e-45d7ab63c37e', '21ee03db-90c4-4592-b00f-c44801e0b164', 'Operational', 'ACTIVE', 'mssql', true, '2025-07-09 09:23:00.254428', '2025-07-09 09:23:00.254428');
INSERT INTO public.status_mappings (id, workspace_id, source_status, target_status, data_source_type, is_active, created_at, updated_at) VALUES ('f30ec63d-4419-44ab-aa9e-221d0cbfb6fa', '21ee03db-90c4-4592-b00f-c44801e0b164', 'Maintenance', 'STOP', 'mssql', true, '2025-07-09 09:23:00.254428', '2025-07-09 09:23:00.254428');
INSERT INTO public.status_mappings (id, workspace_id, source_status, target_status, data_source_type, is_active, created_at, updated_at) VALUES ('12937719-8097-40c1-88a2-dc06b866d638', '21ee03db-90c4-4592-b00f-c44801e0b164', 'Shutdown', 'STOP', 'mssql', true, '2025-07-09 09:23:00.254428', '2025-07-09 09:23:00.254428');
INSERT INTO public.status_mappings (id, workspace_id, source_status, target_status, data_source_type, is_active, created_at, updated_at) VALUES ('08a354a6-37d7-4636-97fb-9bb3f6cd802e', '21ee03db-90c4-4592-b00f-c44801e0b164', 'Standby', 'PAUSE', 'mssql', true, '2025-07-09 09:23:00.254428', '2025-07-09 09:23:00.254428');


--
-- TOC entry 5305 (class 0 OID 21358)
-- Dependencies: 244
-- Data for Name: total_monitoring_database_connections; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- TOC entry 5307 (class 0 OID 21399)
-- Dependencies: 246
-- Data for Name: total_monitoring_equipment_nodes; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- TOC entry 5308 (class 0 OID 21422)
-- Dependencies: 247
-- Data for Name: total_monitoring_instrument_nodes; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- TOC entry 5306 (class 0 OID 21376)
-- Dependencies: 245
-- Data for Name: total_monitoring_process_flows; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- TOC entry 5309 (class 0 OID 21444)
-- Dependencies: 248
-- Data for Name: total_monitoring_published_flows; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- TOC entry 5310 (class 0 OID 21469)
-- Dependencies: 249
-- Data for Name: total_monitoring_query_templates; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- TOC entry 5311 (class 0 OID 21486)
-- Dependencies: 250
-- Data for Name: total_monitoring_workspace_features; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.total_monitoring_workspace_features (id, workspace_id, feature_name, feature_slug, display_name, description, icon, color, route_path, component_path, is_implemented, is_active, sort_order, permissions, created_by, created_at, updated_at) VALUES ('b9ab47d2-f0f2-4773-9c05-c1a4136aafe1', '5b4d5c82-c625-46fa-91f8-776975374d5d', 'Database Setup', 'database_setup', 'Database Setup', 'Configure and manage database connections with encryption', 'database', '#3B82F6', '/database-setup', 'workspaces/public_workspace/components/DatabaseSetup', false, true, 1, '{"read": ["user"], "admin": ["admin"], "write": ["user"]}', 'system', '2025-07-28 16:13:27.731787+09', '2025-07-28 18:18:32.466695+09');
INSERT INTO public.total_monitoring_workspace_features (id, workspace_id, feature_name, feature_slug, display_name, description, icon, color, route_path, component_path, is_implemented, is_active, sort_order, permissions, created_by, created_at, updated_at) VALUES ('ca7e9fd7-e372-465e-b692-a6260723358f', '5b4d5c82-c625-46fa-91f8-776975374d5d', 'Process Flow Editor', 'process_flow_editor', 'Process Flow Editor', 'Design process flows with auto-save and data mapping', 'workflow', '#10B981', '/process-flow-editor', 'workspaces/public_workspace/pages/ProcessFlowEditor', true, true, 2, '{"read": ["user"], "admin": ["admin"], "write": ["user"]}', 'system', '2025-07-28 16:13:27.731787+09', '2025-07-28 18:18:47.180093+09');
INSERT INTO public.total_monitoring_workspace_features (id, workspace_id, feature_name, feature_slug, display_name, description, icon, color, route_path, component_path, is_implemented, is_active, sort_order, permissions, created_by, created_at, updated_at) VALUES ('99c6fde5-e9cc-4bf3-9541-fb1123b08b21', '5b4d5c82-c625-46fa-91f8-776975374d5d', 'Process Flow Monitoring', 'process_flow_monitoring', 'Process Flow Monitoring', 'Monitor process flows with real-time data', 'monitor', '#F59E0B', '/process-flow-monitor', 'workspaces/public_workspace/pages/ProcessFlowMonitor', true, true, 3, '{"read": ["user"], "admin": ["admin"], "write": ["user"]}', 'system', '2025-07-28 16:13:27.731787+09', '2025-07-28 18:18:47.180093+09');
INSERT INTO public.total_monitoring_workspace_features (id, workspace_id, feature_name, feature_slug, display_name, description, icon, color, route_path, component_path, is_implemented, is_active, sort_order, permissions, created_by, created_at, updated_at) VALUES ('ac50cea9-94b8-496d-ba2f-400b5f6427d2', '5b4d5c82-c625-46fa-91f8-776975374d5d', 'Process Flow Publish', 'process_flow_publish', 'Process Flow Publish', 'Publish flows for public access without authentication', 'share', '#8B5CF6', '/process-flow-publish', 'workspaces/public_workspace/components/process_flow_publish/ProcessFlowPublish', true, true, 4, '{"read": ["user"], "admin": ["admin"], "write": ["user"]}', 'system', '2025-07-28 16:13:27.731787+09', '2025-07-28 18:18:47.180093+09');


--
-- TOC entry 5314 (class 0 OID 21726)
-- Dependencies: 253
-- Data for Name: user_sessions; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.user_sessions (session_id, user_id, user_email, created_at, last_accessed, expires_at, is_active, ip_address, user_agent, session_data, jwt_token_id, is_suspicious, login_method) VALUES ('HO6Af6DwKeVZhxmlJ6egNq7AGYdlE0ApxpcfV_NkaPo', 'sync-test-user-456', NULL, '2025-07-31 05:04:46.67775', '2025-07-31 05:04:46.67775', '2025-07-31 06:04:46', true, '192.168.1.100', 'Sync-Test-Browser/2.0', '{"jwt_token_id": "28aa4b43-8dff-4832-a646-28c2d51ed4f2", "user_email": "synctest@example.com", "login_method": "oauth"}', NULL, false, 'oauth');
INSERT INTO public.user_sessions (session_id, user_id, user_email, created_at, last_accessed, expires_at, is_active, ip_address, user_agent, session_data, jwt_token_id, is_suspicious, login_method) VALUES ('YWzfVw_pPvtf36X24mL2PCiixvOVB831DREiU-zFQZA', 'sync-test-user-456', NULL, '2025-07-31 05:04:46.684141', '2025-07-31 05:04:46.684141', '2025-07-31 06:04:46', true, '192.168.1.100', 'Sync-Test-Browser/2.0', '{"jwt_token_id": "28aa4b43-8dff-4832-a646-28c2d51ed4f2", "user_email": "synctest@example.com", "login_method": "oauth"}', NULL, false, 'oauth');
INSERT INTO public.user_sessions (session_id, user_id, user_email, created_at, last_accessed, expires_at, is_active, ip_address, user_agent, session_data, jwt_token_id, is_suspicious, login_method) VALUES ('Z2lmMLI_aFSV7zrinesi9adYYvE9DrogLK7AFPea1DU', 'test-user-123', NULL, '2025-07-31 05:04:46.657761', '2025-07-31 05:04:46.668044', '2025-07-31 06:04:46', false, '127.0.0.1', 'Test-Browser/1.0', '{"jwt_token_id": "d2df02e8-f31c-459c-ab02-3b76392736b0", "user_email": "test@example.com", "login_method": "oauth"}', NULL, false, 'oauth');
INSERT INTO public.user_sessions (session_id, user_id, user_email, created_at, last_accessed, expires_at, is_active, ip_address, user_agent, session_data, jwt_token_id, is_suspicious, login_method) VALUES ('a5AFOM6qWICmVnpD4fm8Tl_FSlEcmx4Dcw9sH1welqE', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', NULL, '2025-08-01 03:32:30.960303', '2025-08-01 03:32:30.960303', '2025-08-01 04:02:27', false, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36', '{"jwt_token_id": "5bca7c3d-ae9e-4ea9-8548-c5e2dc12c898", "user_email": "admin@test.com", "login_method": "oauth"}', NULL, false, 'oauth');
INSERT INTO public.user_sessions (session_id, user_id, user_email, created_at, last_accessed, expires_at, is_active, ip_address, user_agent, session_data, jwt_token_id, is_suspicious, login_method) VALUES ('eYtF3qtkpzoEvtRbwUu4wWqpm0TcqTdLYKCtaP6Kll4', 'sync-test-user-456', NULL, '2025-07-31 05:04:51.320025', '2025-07-31 05:04:51.320025', '2025-07-31 06:04:51', true, '192.168.1.100', 'Sync-Test-Browser/2.0', '{"jwt_token_id": "825f6c4a-f0f6-4be4-88c6-abbb308ed674", "user_email": "synctest@example.com", "login_method": "oauth"}', NULL, false, 'oauth');
INSERT INTO public.user_sessions (session_id, user_id, user_email, created_at, last_accessed, expires_at, is_active, ip_address, user_agent, session_data, jwt_token_id, is_suspicious, login_method) VALUES ('_PaAw2WY0dT-8ToKe2TK79QPl7I2ZFrMF3CiYmovhHo', 'sync-test-user-456', NULL, '2025-07-31 05:04:51.327763', '2025-07-31 05:04:51.327763', '2025-07-31 06:04:51', true, '192.168.1.100', 'Sync-Test-Browser/2.0', '{"jwt_token_id": "825f6c4a-f0f6-4be4-88c6-abbb308ed674", "user_email": "synctest@example.com", "login_method": "oauth"}', NULL, false, 'oauth');
INSERT INTO public.user_sessions (session_id, user_id, user_email, created_at, last_accessed, expires_at, is_active, ip_address, user_agent, session_data, jwt_token_id, is_suspicious, login_method) VALUES ('EEoS95LagLs1Y0aqUEbU7f-5QDqEOrV2EeOKTDj4YOQ', 'test-user-123', NULL, '2025-07-31 05:04:51.299173', '2025-07-31 05:04:51.309084', '2025-07-31 06:04:51', false, '127.0.0.1', 'Test-Browser/1.0', '{"jwt_token_id": "c4368b56-9b5c-4fde-a3b5-3bd0c1c51db2", "user_email": "test@example.com", "login_method": "oauth"}', NULL, false, 'oauth');
INSERT INTO public.user_sessions (session_id, user_id, user_email, created_at, last_accessed, expires_at, is_active, ip_address, user_agent, session_data, jwt_token_id, is_suspicious, login_method) VALUES ('Bh2ugXLYFpy9B_2wF_sOaz4rFmZNQI13Gp7NAScJM04', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', NULL, '2025-07-31 05:57:24.488929', '2025-07-31 05:57:24.488929', '2025-07-31 06:18:28', false, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36', '{"jwt_token_id": "72f0869f-0b2d-4fa0-857d-5760bd6764d5", "user_email": "admin@test.com", "login_method": "oauth"}', NULL, false, 'oauth');
INSERT INTO public.user_sessions (session_id, user_id, user_email, created_at, last_accessed, expires_at, is_active, ip_address, user_agent, session_data, jwt_token_id, is_suspicious, login_method) VALUES ('ldOFBKzqeNcOvnMCbdojAo-17a3zMqp_p9onBWyoHVA', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', NULL, '2025-07-31 05:57:26.967086', '2025-07-31 05:57:26.967086', '2025-07-31 06:18:28', false, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36', '{"jwt_token_id": "72f0869f-0b2d-4fa0-857d-5760bd6764d5", "user_email": "admin@test.com", "login_method": "oauth"}', NULL, false, 'oauth');
INSERT INTO public.user_sessions (session_id, user_id, user_email, created_at, last_accessed, expires_at, is_active, ip_address, user_agent, session_data, jwt_token_id, is_suspicious, login_method) VALUES ('koF_uXM4EJjiEDZUAOgILwpa4Z3kRpDF7IL7v6FrpAE', 'd65db892-9691-46e3-a2c6-d962980f2f51', NULL, '2025-07-31 22:18:59.696356', '2025-07-31 22:18:59.696356', '2025-07-31 22:48:55', false, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36', '{"jwt_token_id": "6ecb565f-9a17-4af0-9de6-d08819298106", "user_email": "krn@test.com", "login_method": "oauth"}', NULL, false, 'oauth');
INSERT INTO public.user_sessions (session_id, user_id, user_email, created_at, last_accessed, expires_at, is_active, ip_address, user_agent, session_data, jwt_token_id, is_suspicious, login_method) VALUES ('Utshb4IdpW-hQ8d3K2bBqYazZXY-6uMcDEVuKnM5iKM', 'd65db892-9691-46e3-a2c6-d962980f2f51', NULL, '2025-07-31 22:19:01.690864', '2025-07-31 22:19:01.690864', '2025-07-31 22:48:55', false, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36', '{"jwt_token_id": "6ecb565f-9a17-4af0-9de6-d08819298106", "user_email": "krn@test.com", "login_method": "oauth"}', NULL, false, 'oauth');
INSERT INTO public.user_sessions (session_id, user_id, user_email, created_at, last_accessed, expires_at, is_active, ip_address, user_agent, session_data, jwt_token_id, is_suspicious, login_method) VALUES ('2UgPiy6c--raVVVlFwEpaJr_W0DsZbAfB2Lu3r7kkY8', 'd65db892-9691-46e3-a2c6-d962980f2f51', NULL, '2025-07-31 22:42:38.54511', '2025-07-31 22:42:38.54511', '2025-07-31 23:12:34', false, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36', '{"jwt_token_id": "9fd78824-9fae-4322-a1c8-27d0b0961124", "user_email": "krn@test.com", "login_method": "oauth"}', NULL, false, 'oauth');
INSERT INTO public.user_sessions (session_id, user_id, user_email, created_at, last_accessed, expires_at, is_active, ip_address, user_agent, session_data, jwt_token_id, is_suspicious, login_method) VALUES ('c_tLD8zroeGFCK3wfWUy0QPiis6WiGA0eb80xcntdoY', 'd65db892-9691-46e3-a2c6-d962980f2f51', NULL, '2025-07-31 22:42:40.144598', '2025-07-31 22:42:40.144598', '2025-07-31 23:12:34', false, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36', '{"jwt_token_id": "9fd78824-9fae-4322-a1c8-27d0b0961124", "user_email": "krn@test.com", "login_method": "oauth"}', NULL, false, 'oauth');
INSERT INTO public.user_sessions (session_id, user_id, user_email, created_at, last_accessed, expires_at, is_active, ip_address, user_agent, session_data, jwt_token_id, is_suspicious, login_method) VALUES ('RO_Mz7MEFTJQxD1hvCtW3h4Utsw7LA6sr0j7WohzgF4', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', NULL, '2025-08-01 00:09:14.03937', '2025-08-01 00:09:14.03937', '2025-08-01 00:39:11', false, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36', '{"jwt_token_id": "b578b645-c3e7-4d0d-8209-c40ecec831a6", "user_email": "admin@test.com", "login_method": "oauth"}', NULL, false, 'oauth');
INSERT INTO public.user_sessions (session_id, user_id, user_email, created_at, last_accessed, expires_at, is_active, ip_address, user_agent, session_data, jwt_token_id, is_suspicious, login_method) VALUES ('RJXBtRtj0MXGK4KHO6N2C7dz-niOIRh5wReki3wHzqQ', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', NULL, '2025-08-01 00:09:15.549847', '2025-08-01 00:09:15.549847', '2025-08-01 00:39:11', false, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36', '{"jwt_token_id": "b578b645-c3e7-4d0d-8209-c40ecec831a6", "user_email": "admin@test.com", "login_method": "oauth"}', NULL, false, 'oauth');
INSERT INTO public.user_sessions (session_id, user_id, user_email, created_at, last_accessed, expires_at, is_active, ip_address, user_agent, session_data, jwt_token_id, is_suspicious, login_method) VALUES ('nUsOPzX340Qmd0Qrwr26TEAigIP4flZ3zFy3iL9x5VY', 'd65db892-9691-46e3-a2c6-d962980f2f51', NULL, '2025-08-01 00:11:33.318998', '2025-08-01 00:11:33.318998', '2025-08-01 00:41:01', false, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36', '{"jwt_token_id": "e42e38f2-ea7d-42cd-9f12-07ef8c9a7821", "user_email": "krn@test.com", "login_method": "oauth"}', NULL, false, 'oauth');
INSERT INTO public.user_sessions (session_id, user_id, user_email, created_at, last_accessed, expires_at, is_active, ip_address, user_agent, session_data, jwt_token_id, is_suspicious, login_method) VALUES ('KRsUt5nw9E8t7ciUD5KvMKJIcy0pmkClasBRjQRsW2M', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', NULL, '2025-08-01 01:29:30.847005', '2025-08-01 01:29:30.847005', '2025-08-01 01:59:26', false, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36', '{"jwt_token_id": "a56ba908-c5fa-4d0e-b1a5-0fb6585b762c", "user_email": "admin@test.com", "login_method": "oauth"}', NULL, false, 'oauth');
INSERT INTO public.user_sessions (session_id, user_id, user_email, created_at, last_accessed, expires_at, is_active, ip_address, user_agent, session_data, jwt_token_id, is_suspicious, login_method) VALUES ('PGH8k49POr1uZh-Ez5PB9dKeNm3BNoctuNzza_re2JY', 'd65db892-9691-46e3-a2c6-d962980f2f51', NULL, '2025-08-01 01:30:15.337831', '2025-08-01 01:30:15.337831', '2025-08-01 02:00:12', false, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36', '{"jwt_token_id": "fcfd0275-6c68-4ce9-bb52-b1a5106c81d1", "user_email": "krn@test.com", "login_method": "oauth"}', NULL, false, 'oauth');
INSERT INTO public.user_sessions (session_id, user_id, user_email, created_at, last_accessed, expires_at, is_active, ip_address, user_agent, session_data, jwt_token_id, is_suspicious, login_method) VALUES ('KOShZ7wfbDw9RFJJuM3HpxV6zU1dKwtgt0VALRKEYKY', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', NULL, '2025-08-01 01:29:28.502292', '2025-08-01 01:29:28.502292', '2025-08-01 01:59:26', false, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36', '{"jwt_token_id": "a56ba908-c5fa-4d0e-b1a5-0fb6585b762c", "user_email": "admin@test.com", "login_method": "oauth"}', NULL, false, 'oauth');
INSERT INTO public.user_sessions (session_id, user_id, user_email, created_at, last_accessed, expires_at, is_active, ip_address, user_agent, session_data, jwt_token_id, is_suspicious, login_method) VALUES ('SZmsqryhNmToFmhrjo_Un8uo1UfQbzs7p8ZSfwNWqTE', 'd65db892-9691-46e3-a2c6-d962980f2f51', NULL, '2025-08-01 00:11:32.137382', '2025-08-01 00:11:32.137382', '2025-08-01 00:41:01', false, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36', '{"jwt_token_id": "e42e38f2-ea7d-42cd-9f12-07ef8c9a7821", "user_email": "krn@test.com", "login_method": "oauth"}', NULL, false, 'oauth');
INSERT INTO public.user_sessions (session_id, user_id, user_email, created_at, last_accessed, expires_at, is_active, ip_address, user_agent, session_data, jwt_token_id, is_suspicious, login_method) VALUES ('My-1b9ky_vlpmitL1thJULvdBWzEa_w7hwgaJ7ftG68', 'd65db892-9691-46e3-a2c6-d962980f2f51', NULL, '2025-08-01 01:46:52.51898', '2025-08-01 01:46:52.51898', '2025-08-01 02:16:47', false, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36', '{"jwt_token_id": "7f829831-33cf-4b53-b55d-f84467b02bff", "user_email": "krn@test.com", "login_method": "oauth"}', NULL, false, 'oauth');
INSERT INTO public.user_sessions (session_id, user_id, user_email, created_at, last_accessed, expires_at, is_active, ip_address, user_agent, session_data, jwt_token_id, is_suspicious, login_method) VALUES ('K1e-zUKljkxiw-ps-D4BQ2w5wk_Xp8aL2pt1pl02mZQ', 'd65db892-9691-46e3-a2c6-d962980f2f51', NULL, '2025-08-01 03:33:11.706381', '2025-08-01 03:33:11.706381', '2025-08-01 04:03:09', true, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36', '{"jwt_token_id": "d8ae5544-3f68-46b5-8047-941942129f16", "user_email": "krn@test.com", "login_method": "oauth"}', NULL, false, 'oauth');
INSERT INTO public.user_sessions (session_id, user_id, user_email, created_at, last_accessed, expires_at, is_active, ip_address, user_agent, session_data, jwt_token_id, is_suspicious, login_method) VALUES ('jL9i9iu6oY8AkpUjD1tNIf10SrC6hXTaYyp9XzPnQfg', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', NULL, '2025-08-01 01:54:20.087996', '2025-08-01 01:54:20.087996', '2025-08-01 02:24:17', false, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36', '{"jwt_token_id": "a445ad43-c363-45d2-8e7c-ef40220e6f61", "user_email": "admin@test.com", "login_method": "oauth"}', NULL, false, 'oauth');
INSERT INTO public.user_sessions (session_id, user_id, user_email, created_at, last_accessed, expires_at, is_active, ip_address, user_agent, session_data, jwt_token_id, is_suspicious, login_method) VALUES ('W5jrfv2vLqwsGgG5xYztyJdIQHJVIljSpbG3CifQEmU', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', NULL, '2025-08-01 01:54:21.796375', '2025-08-01 01:54:21.796375', '2025-08-01 02:24:17', false, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36', '{"jwt_token_id": "a445ad43-c363-45d2-8e7c-ef40220e6f61", "user_email": "admin@test.com", "login_method": "oauth"}', NULL, false, 'oauth');
INSERT INTO public.user_sessions (session_id, user_id, user_email, created_at, last_accessed, expires_at, is_active, ip_address, user_agent, session_data, jwt_token_id, is_suspicious, login_method) VALUES ('GeAf-6gJm4n_NMIjvfkDbrsShCT4OkTKm24GquC4EnA', 'd65db892-9691-46e3-a2c6-d962980f2f51', NULL, '2025-08-01 03:33:12.926036', '2025-08-01 03:33:12.926036', '2025-08-01 04:03:09', false, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36', '{"jwt_token_id": "d8ae5544-3f68-46b5-8047-941942129f16", "user_email": "krn@test.com", "login_method": "oauth"}', NULL, false, 'oauth');
INSERT INTO public.user_sessions (session_id, user_id, user_email, created_at, last_accessed, expires_at, is_active, ip_address, user_agent, session_data, jwt_token_id, is_suspicious, login_method) VALUES ('Rs5ikGdC2XmV86kjlYyFlBfqJMp3FzDpYZdP1Lp3_Ho', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', NULL, '2025-08-01 01:54:40.354484', '2025-08-01 01:54:40.354484', '2025-08-01 02:24:36', false, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36', '{"jwt_token_id": "dedcf540-89c6-4e35-b457-fc95ee7cb819", "user_email": "admin@test.com", "login_method": "oauth"}', NULL, false, 'oauth');
INSERT INTO public.user_sessions (session_id, user_id, user_email, created_at, last_accessed, expires_at, is_active, ip_address, user_agent, session_data, jwt_token_id, is_suspicious, login_method) VALUES ('5fpAn8TD3925E-jAx_TNJBeDDcM7MP34-l8jmv3jGFQ', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', NULL, '2025-08-01 01:54:43.733729', '2025-08-01 01:54:43.733729', '2025-08-01 02:24:36', false, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36', '{"jwt_token_id": "dedcf540-89c6-4e35-b457-fc95ee7cb819", "user_email": "admin@test.com", "login_method": "oauth"}', NULL, false, 'oauth');
INSERT INTO public.user_sessions (session_id, user_id, user_email, created_at, last_accessed, expires_at, is_active, ip_address, user_agent, session_data, jwt_token_id, is_suspicious, login_method) VALUES ('wvvuGxkjHe1i4bjYZ7NKc16iiqSqyjQlssu0tpS_doU', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', NULL, '2025-08-01 06:36:26.007024', '2025-08-01 06:36:26.007024', '2025-08-01 07:06:19', false, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36', '{"jwt_token_id": "d3f75e5b-dc2f-477a-abb7-4f17b058bfec", "user_email": "admin@test.com", "login_method": "oauth"}', NULL, false, 'oauth');
INSERT INTO public.user_sessions (session_id, user_id, user_email, created_at, last_accessed, expires_at, is_active, ip_address, user_agent, session_data, jwt_token_id, is_suspicious, login_method) VALUES ('2rzpaWwZEpEyA9bViOr0ouNNdu_T82OtyYdp8az5Ius', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', NULL, '2025-08-01 01:54:32.635891', '2025-08-01 01:54:32.635891', '2025-08-01 02:24:25', false, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36', '{"jwt_token_id": "3d98e781-c2ea-44a1-b881-9508799e36d1", "user_email": "admin@test.com", "login_method": "oauth"}', NULL, false, 'oauth');
INSERT INTO public.user_sessions (session_id, user_id, user_email, created_at, last_accessed, expires_at, is_active, ip_address, user_agent, session_data, jwt_token_id, is_suspicious, login_method) VALUES ('lzwK_cbalEUIbgShdxiq8YbHkC5bQomZqbpTpFrg_jI', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', NULL, '2025-08-01 01:54:28.999464', '2025-08-01 01:54:28.999464', '2025-08-01 02:24:25', false, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36', '{"jwt_token_id": "3d98e781-c2ea-44a1-b881-9508799e36d1", "user_email": "admin@test.com", "login_method": "oauth"}', NULL, false, 'oauth');
INSERT INTO public.user_sessions (session_id, user_id, user_email, created_at, last_accessed, expires_at, is_active, ip_address, user_agent, session_data, jwt_token_id, is_suspicious, login_method) VALUES ('gPO3j1vhdS9ovRfAp9J3kyEm9_10F-By1bV45cNLvrw', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', NULL, '2025-08-01 02:01:49.47543', '2025-08-01 02:01:49.47543', '2025-08-01 02:24:46', false, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36', '{"jwt_token_id": "417a52e3-9001-4726-927e-6b2684e4c855", "user_email": "admin@test.com", "login_method": "oauth"}', NULL, false, 'oauth');
INSERT INTO public.user_sessions (session_id, user_id, user_email, created_at, last_accessed, expires_at, is_active, ip_address, user_agent, session_data, jwt_token_id, is_suspicious, login_method) VALUES ('TDuCgTiMXtybTKr1H6lO5oIDiMr-Uy6opT0Yo2xR3yE', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', NULL, '2025-08-01 02:01:47.960988', '2025-08-01 02:01:47.960988', '2025-08-01 02:24:46', false, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36', '{"jwt_token_id": "417a52e3-9001-4726-927e-6b2684e4c855", "user_email": "admin@test.com", "login_method": "oauth"}', NULL, false, 'oauth');
INSERT INTO public.user_sessions (session_id, user_id, user_email, created_at, last_accessed, expires_at, is_active, ip_address, user_agent, session_data, jwt_token_id, is_suspicious, login_method) VALUES ('Tw2KLeCDtvFALg_v-bVclPoIo4pm9oyNm8mIwo326e0', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', NULL, '2025-08-01 02:02:23.872261', '2025-08-01 02:02:23.872261', '2025-08-01 02:32:19', false, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36', '{"jwt_token_id": "269dc6f7-0d72-452b-b8f5-8e76c540f6f9", "user_email": "admin@test.com", "login_method": "oauth"}', NULL, false, 'oauth');
INSERT INTO public.user_sessions (session_id, user_id, user_email, created_at, last_accessed, expires_at, is_active, ip_address, user_agent, session_data, jwt_token_id, is_suspicious, login_method) VALUES ('0oMXgc7m3VZ4EmzAk7obTrFxVnk0rdI-OaI6Wm2U1P8', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', NULL, '2025-08-01 02:02:26.528079', '2025-08-01 02:02:26.528079', '2025-08-01 02:32:19', false, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36', '{"jwt_token_id": "269dc6f7-0d72-452b-b8f5-8e76c540f6f9", "user_email": "admin@test.com", "login_method": "oauth"}', NULL, false, 'oauth');
INSERT INTO public.user_sessions (session_id, user_id, user_email, created_at, last_accessed, expires_at, is_active, ip_address, user_agent, session_data, jwt_token_id, is_suspicious, login_method) VALUES ('oi1U37cfIoX54V2r0y7SZtGORXivWaGaILShZj0ukps', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', NULL, '2025-08-01 02:03:04.601846', '2025-08-01 02:03:04.601846', '2025-08-01 02:33:00', false, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36', '{"jwt_token_id": "bf30789b-1631-41a3-8fbb-875175689cb8", "user_email": "admin@test.com", "login_method": "oauth"}', NULL, false, 'oauth');
INSERT INTO public.user_sessions (session_id, user_id, user_email, created_at, last_accessed, expires_at, is_active, ip_address, user_agent, session_data, jwt_token_id, is_suspicious, login_method) VALUES ('m8cGVSewwpZIL4ZIqRZL-4MC6-6mbUpDJ8fSAWlJ92A', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', NULL, '2025-08-01 02:03:09.879986', '2025-08-01 02:03:09.879986', '2025-08-01 02:33:00', false, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36', '{"jwt_token_id": "bf30789b-1631-41a3-8fbb-875175689cb8", "user_email": "admin@test.com", "login_method": "oauth"}', NULL, false, 'oauth');
INSERT INTO public.user_sessions (session_id, user_id, user_email, created_at, last_accessed, expires_at, is_active, ip_address, user_agent, session_data, jwt_token_id, is_suspicious, login_method) VALUES ('uSwynAPTMTkAnWbhIpF251vI95WhXWfg1mxB2AtiukQ', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', NULL, '2025-08-01 02:03:54.316062', '2025-08-01 02:03:54.316062', '2025-08-01 02:33:52', false, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36', '{"jwt_token_id": "0013688d-0afa-41b6-bb0d-c290baddc73b", "user_email": "admin@test.com", "login_method": "oauth"}', NULL, false, 'oauth');
INSERT INTO public.user_sessions (session_id, user_id, user_email, created_at, last_accessed, expires_at, is_active, ip_address, user_agent, session_data, jwt_token_id, is_suspicious, login_method) VALUES ('du7wJ3K906t1fNsHEIRuHmlM3j_cGdqg04XeEbIg1kM', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', NULL, '2025-08-01 02:03:55.653586', '2025-08-01 02:03:55.653586', '2025-08-01 02:33:52', false, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36', '{"jwt_token_id": "0013688d-0afa-41b6-bb0d-c290baddc73b", "user_email": "admin@test.com", "login_method": "oauth"}', NULL, false, 'oauth');
INSERT INTO public.user_sessions (session_id, user_id, user_email, created_at, last_accessed, expires_at, is_active, ip_address, user_agent, session_data, jwt_token_id, is_suspicious, login_method) VALUES ('YZ-q2HziCL1Sq-XZkhXDmkfOGta5AKuQcr8-dwP55tQ', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', NULL, '2025-08-01 02:09:08.280483', '2025-08-01 02:09:08.280483', '2025-08-01 02:39:05', false, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36', '{"jwt_token_id": "1e611516-ef6b-4c65-a04c-458fa9b0907c", "user_email": "admin@test.com", "login_method": "oauth"}', NULL, false, 'oauth');
INSERT INTO public.user_sessions (session_id, user_id, user_email, created_at, last_accessed, expires_at, is_active, ip_address, user_agent, session_data, jwt_token_id, is_suspicious, login_method) VALUES ('RuX9AdfRVE_LAfcKm-QabE37hfV7v0-lB7lVp5Io1Vo', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', NULL, '2025-08-01 02:09:09.954933', '2025-08-01 02:09:09.954933', '2025-08-01 02:39:05', false, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36', '{"jwt_token_id": "1e611516-ef6b-4c65-a04c-458fa9b0907c", "user_email": "admin@test.com", "login_method": "oauth"}', NULL, false, 'oauth');
INSERT INTO public.user_sessions (session_id, user_id, user_email, created_at, last_accessed, expires_at, is_active, ip_address, user_agent, session_data, jwt_token_id, is_suspicious, login_method) VALUES ('sFYCOI3QSSnjHuIZodDm1Q2k0dbyDydEzUhGk-owiaA', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', NULL, '2025-08-01 02:10:32.310124', '2025-08-01 02:10:32.310124', '2025-08-01 02:40:28', false, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36', '{"jwt_token_id": "8fc7b549-7204-4e8a-a7d4-94743955f23c", "user_email": "admin@test.com", "login_method": "oauth"}', NULL, false, 'oauth');
INSERT INTO public.user_sessions (session_id, user_id, user_email, created_at, last_accessed, expires_at, is_active, ip_address, user_agent, session_data, jwt_token_id, is_suspicious, login_method) VALUES ('wJKT59WpSPGUtRmrFK_VoW5PH9Szm8Rly9itNFbXPSI', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', NULL, '2025-08-01 02:10:35.376151', '2025-08-01 02:10:35.376151', '2025-08-01 02:40:28', false, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36', '{"jwt_token_id": "8fc7b549-7204-4e8a-a7d4-94743955f23c", "user_email": "admin@test.com", "login_method": "oauth"}', NULL, false, 'oauth');
INSERT INTO public.user_sessions (session_id, user_id, user_email, created_at, last_accessed, expires_at, is_active, ip_address, user_agent, session_data, jwt_token_id, is_suspicious, login_method) VALUES ('8HyGmggN528_Swews_LjOtmD_lMSNaz-qvHwF-Cbe3s', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', NULL, '2025-08-01 02:14:02.414927', '2025-08-01 02:14:02.414927', '2025-08-01 02:44:00', false, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36', '{"jwt_token_id": "2d76c63a-f4d0-45e9-8ca7-6cfa2381b129", "user_email": "admin@test.com", "login_method": "oauth"}', NULL, false, 'oauth');
INSERT INTO public.user_sessions (session_id, user_id, user_email, created_at, last_accessed, expires_at, is_active, ip_address, user_agent, session_data, jwt_token_id, is_suspicious, login_method) VALUES ('E3LfCq-jNcWhvg1C16C94S4H4IxD1cWmqrWWPXgGB6U', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', NULL, '2025-08-01 02:14:06.454042', '2025-08-01 02:14:06.454042', '2025-08-01 02:44:00', false, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36', '{"jwt_token_id": "2d76c63a-f4d0-45e9-8ca7-6cfa2381b129", "user_email": "admin@test.com", "login_method": "oauth"}', NULL, false, 'oauth');
INSERT INTO public.user_sessions (session_id, user_id, user_email, created_at, last_accessed, expires_at, is_active, ip_address, user_agent, session_data, jwt_token_id, is_suspicious, login_method) VALUES ('UEdW_N1ALQP6Eds9uv--Jb7saNYZIDOZIz7F5du_Zdo', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', NULL, '2025-08-01 02:14:24.636641', '2025-08-01 02:14:24.636641', '2025-08-01 02:44:15', false, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36', '{"jwt_token_id": "d8641574-b1f5-4295-84a4-79fc0dd8bcb5", "user_email": "admin@test.com", "login_method": "oauth"}', NULL, false, 'oauth');
INSERT INTO public.user_sessions (session_id, user_id, user_email, created_at, last_accessed, expires_at, is_active, ip_address, user_agent, session_data, jwt_token_id, is_suspicious, login_method) VALUES ('cwy13ZLu7Yi8fnqC2efQDzEqUgQK1tpmZjYgpk4D8mQ', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', NULL, '2025-08-01 02:21:03.918238', '2025-08-01 02:21:03.918238', '2025-08-01 02:50:50', false, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36', '{"jwt_token_id": "797eed14-dd85-434c-b2ba-05c2ffa34192", "user_email": "admin@test.com", "login_method": "oauth"}', NULL, false, 'oauth');
INSERT INTO public.user_sessions (session_id, user_id, user_email, created_at, last_accessed, expires_at, is_active, ip_address, user_agent, session_data, jwt_token_id, is_suspicious, login_method) VALUES ('5zz5fNzwQnIzucCTNaBebxA7ShmYFzZba89FWiklNTU', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', NULL, '2025-08-01 02:28:45.615965', '2025-08-01 02:28:45.615965', '2025-08-01 02:58:43', false, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36', '{"jwt_token_id": "a12cb65d-d35a-4278-bf9e-efb8361e052d", "user_email": "admin@test.com", "login_method": "oauth"}', NULL, false, 'oauth');
INSERT INTO public.user_sessions (session_id, user_id, user_email, created_at, last_accessed, expires_at, is_active, ip_address, user_agent, session_data, jwt_token_id, is_suspicious, login_method) VALUES ('qSFqlTVICcLMB-OffHBKgs1sUfpHjtBAej8YkuA7TxI', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', NULL, '2025-08-01 02:14:21.461705', '2025-08-01 02:14:21.461705', '2025-08-01 02:44:15', false, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36', '{"jwt_token_id": "d8641574-b1f5-4295-84a4-79fc0dd8bcb5", "user_email": "admin@test.com", "login_method": "oauth"}', NULL, false, 'oauth');
INSERT INTO public.user_sessions (session_id, user_id, user_email, created_at, last_accessed, expires_at, is_active, ip_address, user_agent, session_data, jwt_token_id, is_suspicious, login_method) VALUES ('gWK4-d9z1R1rIarb29X_L4RHn35JcCCtKecgGeGBAiQ', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', NULL, '2025-08-01 02:17:02.873543', '2025-08-01 02:17:02.873543', '2025-08-01 02:46:58', false, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36', '{"jwt_token_id": "f60aafef-1255-47d8-a30a-7ff751d6eeb2", "user_email": "admin@test.com", "login_method": "oauth"}', NULL, false, 'oauth');
INSERT INTO public.user_sessions (session_id, user_id, user_email, created_at, last_accessed, expires_at, is_active, ip_address, user_agent, session_data, jwt_token_id, is_suspicious, login_method) VALUES ('FYHPmLH7oxl82fRUNHwwZGqWBcgoqvqFIn5I2OglGOk', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', NULL, '2025-08-01 02:17:04.511961', '2025-08-01 02:17:04.511961', '2025-08-01 02:46:58', false, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36', '{"jwt_token_id": "f60aafef-1255-47d8-a30a-7ff751d6eeb2", "user_email": "admin@test.com", "login_method": "oauth"}', NULL, false, 'oauth');
INSERT INTO public.user_sessions (session_id, user_id, user_email, created_at, last_accessed, expires_at, is_active, ip_address, user_agent, session_data, jwt_token_id, is_suspicious, login_method) VALUES ('S6CLobRDoeTeqlh78GPrCkQsmwZ9MOxq10DsHRm8nQk', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', NULL, '2025-08-01 04:21:41.146393', '2025-08-01 04:21:41.146393', '2025-08-01 04:51:37', false, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36', '{"jwt_token_id": "0720bcae-d9e5-4cba-8bb4-8224d4ed0fd3", "user_email": "admin@test.com", "login_method": "oauth"}', NULL, false, 'oauth');
INSERT INTO public.user_sessions (session_id, user_id, user_email, created_at, last_accessed, expires_at, is_active, ip_address, user_agent, session_data, jwt_token_id, is_suspicious, login_method) VALUES ('JL9ZWqPJUlaLi2j4WAnsdyDPUaeA7wBYdMmNZBbEMyA', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', NULL, '2025-08-01 02:20:44.701274', '2025-08-01 02:20:44.701274', '2025-08-01 02:50:42', false, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36', '{"jwt_token_id": "80945ba8-691f-4516-9af0-fb548463797e", "user_email": "admin@test.com", "login_method": "oauth"}', NULL, false, 'oauth');
INSERT INTO public.user_sessions (session_id, user_id, user_email, created_at, last_accessed, expires_at, is_active, ip_address, user_agent, session_data, jwt_token_id, is_suspicious, login_method) VALUES ('qLCib85iQqCk5k4EfEbRt6o-pkFsmIpZ2aPRBmzJ_QE', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', NULL, '2025-08-01 02:20:46.209008', '2025-08-01 02:20:46.209008', '2025-08-01 02:50:42', false, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36', '{"jwt_token_id": "80945ba8-691f-4516-9af0-fb548463797e", "user_email": "admin@test.com", "login_method": "oauth"}', NULL, false, 'oauth');
INSERT INTO public.user_sessions (session_id, user_id, user_email, created_at, last_accessed, expires_at, is_active, ip_address, user_agent, session_data, jwt_token_id, is_suspicious, login_method) VALUES ('E0RJMvrpgRMVbxDHbAVhMJc0fLBtEQ7uDiQjLaGnM_4', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', NULL, '2025-08-01 02:26:39.244576', '2025-08-01 02:26:39.244576', '2025-08-01 02:50:50', false, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36', '{"jwt_token_id": "797eed14-dd85-434c-b2ba-05c2ffa34192", "user_email": "admin@test.com", "login_method": "oauth"}', NULL, false, 'oauth');
INSERT INTO public.user_sessions (session_id, user_id, user_email, created_at, last_accessed, expires_at, is_active, ip_address, user_agent, session_data, jwt_token_id, is_suspicious, login_method) VALUES ('YPh0hHykHsoGekWKfOMh0D_0uuNQsQuwmXGdKNdMXqA', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', NULL, '2025-08-01 02:26:45.139997', '2025-08-01 02:26:45.139997', '2025-08-01 02:56:43', false, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36', '{"jwt_token_id": "e19164bc-9e94-4967-981c-8ca0088003e5", "user_email": "admin@test.com", "login_method": "oauth"}', NULL, false, 'oauth');
INSERT INTO public.user_sessions (session_id, user_id, user_email, created_at, last_accessed, expires_at, is_active, ip_address, user_agent, session_data, jwt_token_id, is_suspicious, login_method) VALUES ('2fPoeFZMTdx2OVzC26BiHqUXZ8wlNt6CZSeXqgmu-D8', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', NULL, '2025-08-01 02:26:46.850914', '2025-08-01 02:26:46.850914', '2025-08-01 02:56:43', false, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36', '{"jwt_token_id": "e19164bc-9e94-4967-981c-8ca0088003e5", "user_email": "admin@test.com", "login_method": "oauth"}', NULL, false, 'oauth');
INSERT INTO public.user_sessions (session_id, user_id, user_email, created_at, last_accessed, expires_at, is_active, ip_address, user_agent, session_data, jwt_token_id, is_suspicious, login_method) VALUES ('yM06DpfO-CHUv04yO41S8QBAh7sz3FCpMinozXUyKNc', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', NULL, '2025-08-01 02:28:47.999525', '2025-08-01 02:28:47.999525', '2025-08-01 02:58:43', false, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36', '{"jwt_token_id": "a12cb65d-d35a-4278-bf9e-efb8361e052d", "user_email": "admin@test.com", "login_method": "oauth"}', NULL, false, 'oauth');
INSERT INTO public.user_sessions (session_id, user_id, user_email, created_at, last_accessed, expires_at, is_active, ip_address, user_agent, session_data, jwt_token_id, is_suspicious, login_method) VALUES ('aL8lWEY-mlZcxxFsaQzT-L2hZzVT3fNpU0C4fELNBo8', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', NULL, '2025-08-01 02:31:56.791385', '2025-08-01 02:31:56.791385', '2025-08-01 03:01:52', false, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36', '{"jwt_token_id": "221cd49c-d465-49fa-8e8d-d6b687eafbc5", "user_email": "admin@test.com", "login_method": "oauth"}', NULL, false, 'oauth');
INSERT INTO public.user_sessions (session_id, user_id, user_email, created_at, last_accessed, expires_at, is_active, ip_address, user_agent, session_data, jwt_token_id, is_suspicious, login_method) VALUES ('_K2WBcpgVXcMVbLbicg5NrYpK4nTM26qdxPlbvQRark', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', NULL, '2025-08-01 02:31:58.837958', '2025-08-01 02:31:58.837958', '2025-08-01 03:01:52', false, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36', '{"jwt_token_id": "221cd49c-d465-49fa-8e8d-d6b687eafbc5", "user_email": "admin@test.com", "login_method": "oauth"}', NULL, false, 'oauth');
INSERT INTO public.user_sessions (session_id, user_id, user_email, created_at, last_accessed, expires_at, is_active, ip_address, user_agent, session_data, jwt_token_id, is_suspicious, login_method) VALUES ('8NcsIekxbcJbSDf8iIg7BEmJ9BT-NKipdAY7yLRTabs', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', NULL, '2025-08-01 02:36:07.536093', '2025-08-01 02:36:07.536093', '2025-08-01 03:06:05', false, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36', '{"jwt_token_id": "f0c0582f-c988-444b-b482-6bc2dc46eb71", "user_email": "admin@test.com", "login_method": "oauth"}', NULL, false, 'oauth');
INSERT INTO public.user_sessions (session_id, user_id, user_email, created_at, last_accessed, expires_at, is_active, ip_address, user_agent, session_data, jwt_token_id, is_suspicious, login_method) VALUES ('6wQvQJTBiyr-JRjXi6_x59sMVysn505rQAnMr2YHsqU', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', NULL, '2025-08-01 02:36:09.555735', '2025-08-01 02:36:09.555735', '2025-08-01 03:06:05', false, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36', '{"jwt_token_id": "f0c0582f-c988-444b-b482-6bc2dc46eb71", "user_email": "admin@test.com", "login_method": "oauth"}', NULL, false, 'oauth');
INSERT INTO public.user_sessions (session_id, user_id, user_email, created_at, last_accessed, expires_at, is_active, ip_address, user_agent, session_data, jwt_token_id, is_suspicious, login_method) VALUES ('stpl5o2H5_Zi4MU5sP68E_ikTEopUhRwo4ZpMR09EnE', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', NULL, '2025-08-01 02:38:53.728848', '2025-08-01 02:38:53.728848', '2025-08-01 03:08:51', false, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36', '{"jwt_token_id": "fffba4ec-a1f1-4102-b3e4-f354eea7cea7", "user_email": "admin@test.com", "login_method": "oauth"}', NULL, false, 'oauth');
INSERT INTO public.user_sessions (session_id, user_id, user_email, created_at, last_accessed, expires_at, is_active, ip_address, user_agent, session_data, jwt_token_id, is_suspicious, login_method) VALUES ('FWZ1PoN1Uu4DSoHTM_F6TfWnBkt05z9WWksXF5P4kZQ', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', NULL, '2025-08-01 02:38:55.456869', '2025-08-01 02:38:55.456869', '2025-08-01 03:08:51', false, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36', '{"jwt_token_id": "fffba4ec-a1f1-4102-b3e4-f354eea7cea7", "user_email": "admin@test.com", "login_method": "oauth"}', NULL, false, 'oauth');
INSERT INTO public.user_sessions (session_id, user_id, user_email, created_at, last_accessed, expires_at, is_active, ip_address, user_agent, session_data, jwt_token_id, is_suspicious, login_method) VALUES ('c7bxWFEOxqrH49iMwGXz6YuJ2LEgZ3SJGyK-pTm1zWk', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', NULL, '2025-08-01 02:41:18.031075', '2025-08-01 02:41:18.031075', '2025-08-01 03:11:14', false, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36', '{"jwt_token_id": "c6f3f981-8865-4377-b295-b8ac57ee1ae8", "user_email": "admin@test.com", "login_method": "oauth"}', NULL, false, 'oauth');
INSERT INTO public.user_sessions (session_id, user_id, user_email, created_at, last_accessed, expires_at, is_active, ip_address, user_agent, session_data, jwt_token_id, is_suspicious, login_method) VALUES ('RQYRbVc74tT0gwIlDb3beHtUe6uuyrTQbRUdDCX84LE', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', NULL, '2025-08-01 02:41:20.357053', '2025-08-01 02:41:20.357053', '2025-08-01 03:11:14', false, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36', '{"jwt_token_id": "c6f3f981-8865-4377-b295-b8ac57ee1ae8", "user_email": "admin@test.com", "login_method": "oauth"}', NULL, false, 'oauth');
INSERT INTO public.user_sessions (session_id, user_id, user_email, created_at, last_accessed, expires_at, is_active, ip_address, user_agent, session_data, jwt_token_id, is_suspicious, login_method) VALUES ('aLJ7doeIU9dqCAFFuOan4HWkWB08pWeYz28pvSU-xLw', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', NULL, '2025-08-01 02:42:39.697701', '2025-08-01 02:42:39.697701', '2025-08-01 03:12:38', false, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36', '{"jwt_token_id": "3649e45a-21c3-42d8-bf3b-0a6fa5a7674f", "user_email": "admin@test.com", "login_method": "oauth"}', NULL, false, 'oauth');
INSERT INTO public.user_sessions (session_id, user_id, user_email, created_at, last_accessed, expires_at, is_active, ip_address, user_agent, session_data, jwt_token_id, is_suspicious, login_method) VALUES ('XKcjKoeXx4xVaB_pSEgWG4ZHgusGzbJCV3hpkq35xtk', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', NULL, '2025-08-01 02:42:40.978475', '2025-08-01 02:42:40.978475', '2025-08-01 03:12:38', false, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36', '{"jwt_token_id": "3649e45a-21c3-42d8-bf3b-0a6fa5a7674f", "user_email": "admin@test.com", "login_method": "oauth"}', NULL, false, 'oauth');
INSERT INTO public.user_sessions (session_id, user_id, user_email, created_at, last_accessed, expires_at, is_active, ip_address, user_agent, session_data, jwt_token_id, is_suspicious, login_method) VALUES ('KqhEMxkzOTC5k_lhwDEzeCFjFcuh8JryeXZK8qr19vo', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', NULL, '2025-08-01 02:46:10.932956', '2025-08-01 02:46:10.932956', '2025-08-01 03:16:09', false, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36', '{"jwt_token_id": "c99ec4cd-2e6b-47ae-8a5f-7acd587a0fc5", "user_email": "admin@test.com", "login_method": "oauth"}', NULL, false, 'oauth');
INSERT INTO public.user_sessions (session_id, user_id, user_email, created_at, last_accessed, expires_at, is_active, ip_address, user_agent, session_data, jwt_token_id, is_suspicious, login_method) VALUES ('Vyt79dxNr3KpFNmqqq_4ziU8ezzn-IiSvTEu-rkpZL8', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', NULL, '2025-08-01 02:46:12.182288', '2025-08-01 02:46:12.182288', '2025-08-01 03:16:09', false, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36', '{"jwt_token_id": "c99ec4cd-2e6b-47ae-8a5f-7acd587a0fc5", "user_email": "admin@test.com", "login_method": "oauth"}', NULL, false, 'oauth');
INSERT INTO public.user_sessions (session_id, user_id, user_email, created_at, last_accessed, expires_at, is_active, ip_address, user_agent, session_data, jwt_token_id, is_suspicious, login_method) VALUES ('VEJh4URgcdGhAyN-z6w2wOUs8PuvSPZdVPrNYByLrqg', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', NULL, '2025-08-01 06:36:16.897903', '2025-08-01 06:36:16.897903', '2025-08-01 07:06:10', false, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36', '{"jwt_token_id": "fb1b2897-5097-4c20-86ad-94f3bd495247", "user_email": "admin@test.com", "login_method": "oauth"}', NULL, false, 'oauth');
INSERT INTO public.user_sessions (session_id, user_id, user_email, created_at, last_accessed, expires_at, is_active, ip_address, user_agent, session_data, jwt_token_id, is_suspicious, login_method) VALUES ('5cyahDEcf7IocFICSdBK2_vT8H9OVJCWIYycZQdaGsQ', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', NULL, '2025-08-01 03:32:28.755427', '2025-08-01 03:32:28.755427', '2025-08-01 04:02:27', false, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36', '{"jwt_token_id": "5bca7c3d-ae9e-4ea9-8548-c5e2dc12c898", "user_email": "admin@test.com", "login_method": "oauth"}', NULL, false, 'oauth');
INSERT INTO public.user_sessions (session_id, user_id, user_email, created_at, last_accessed, expires_at, is_active, ip_address, user_agent, session_data, jwt_token_id, is_suspicious, login_method) VALUES ('D7zjAgRMssqt2f1gOvfGl2HzO5A_rAVF53GDFRWPjj8', 'd65db892-9691-46e3-a2c6-d962980f2f51', NULL, '2025-08-01 01:30:14.041573', '2025-08-01 01:30:14.041573', '2025-08-01 02:00:12', false, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36', '{"jwt_token_id": "fcfd0275-6c68-4ce9-bb52-b1a5106c81d1", "user_email": "krn@test.com", "login_method": "oauth"}', NULL, false, 'oauth');
INSERT INTO public.user_sessions (session_id, user_id, user_email, created_at, last_accessed, expires_at, is_active, ip_address, user_agent, session_data, jwt_token_id, is_suspicious, login_method) VALUES ('pmWvZsIGzWi_SQb12xrf2Q62-t5KTyd2p4dfBQmBEqA', 'd65db892-9691-46e3-a2c6-d962980f2f51', NULL, '2025-08-01 01:46:51.095631', '2025-08-01 01:46:51.095631', '2025-08-01 02:16:47', false, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36', '{"jwt_token_id": "7f829831-33cf-4b53-b55d-f84467b02bff", "user_email": "krn@test.com", "login_method": "oauth"}', NULL, false, 'oauth');
INSERT INTO public.user_sessions (session_id, user_id, user_email, created_at, last_accessed, expires_at, is_active, ip_address, user_agent, session_data, jwt_token_id, is_suspicious, login_method) VALUES ('5wUH9qzfvgfjLZ7hlFvQiKSsXuFbROLkGciTQG0b_Mw', 'd65db892-9691-46e3-a2c6-d962980f2f51', NULL, '2025-08-01 03:19:29.684697', '2025-08-01 03:19:29.684697', '2025-08-01 03:49:27', false, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36', '{"jwt_token_id": "ee8c2947-bc87-4fd7-ab4e-08c7ce2ba1a4", "user_email": "krn@test.com", "login_method": "oauth"}', NULL, false, 'oauth');
INSERT INTO public.user_sessions (session_id, user_id, user_email, created_at, last_accessed, expires_at, is_active, ip_address, user_agent, session_data, jwt_token_id, is_suspicious, login_method) VALUES ('IbFXhKe4YGjQia7YxHSctivVkUCUzTRXPKHQMAbRSe8', 'd65db892-9691-46e3-a2c6-d962980f2f51', NULL, '2025-08-01 03:19:31.663436', '2025-08-01 03:19:31.663436', '2025-08-01 03:49:27', false, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36', '{"jwt_token_id": "ee8c2947-bc87-4fd7-ab4e-08c7ce2ba1a4", "user_email": "krn@test.com", "login_method": "oauth"}', NULL, false, 'oauth');
INSERT INTO public.user_sessions (session_id, user_id, user_email, created_at, last_accessed, expires_at, is_active, ip_address, user_agent, session_data, jwt_token_id, is_suspicious, login_method) VALUES ('vGZhU6YyPqNQJ__JF_i0D5CLI6OKDRLBmlTN3xr8CaY', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', NULL, '2025-08-01 06:36:24.733648', '2025-08-01 06:36:24.733648', '2025-08-01 07:06:19', false, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36', '{"jwt_token_id": "d3f75e5b-dc2f-477a-abb7-4f17b058bfec", "user_email": "admin@test.com", "login_method": "oauth"}', NULL, false, 'oauth');
INSERT INTO public.user_sessions (session_id, user_id, user_email, created_at, last_accessed, expires_at, is_active, ip_address, user_agent, session_data, jwt_token_id, is_suspicious, login_method) VALUES ('QWTCvUkhOSiVqh2RfjNw6n2P3zMJv39RTlgsv3ntXh0', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', NULL, '2025-08-01 04:21:39.377667', '2025-08-01 04:21:39.377667', '2025-08-01 04:51:37', false, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36', '{"jwt_token_id": "0720bcae-d9e5-4cba-8bb4-8224d4ed0fd3", "user_email": "admin@test.com", "login_method": "oauth"}', NULL, false, 'oauth');
INSERT INTO public.user_sessions (session_id, user_id, user_email, created_at, last_accessed, expires_at, is_active, ip_address, user_agent, session_data, jwt_token_id, is_suspicious, login_method) VALUES ('_LB12Y0YPv_vXAMz905YfgPuQajqSKeXy7MYsz6KUZY', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', NULL, '2025-08-01 06:36:13.071729', '2025-08-01 06:36:13.071729', '2025-08-01 07:06:10', false, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36', '{"jwt_token_id": "fb1b2897-5097-4c20-86ad-94f3bd495247", "user_email": "admin@test.com", "login_method": "oauth"}', NULL, false, 'oauth');


--
-- TOC entry 5296 (class 0 OID 19974)
-- Dependencies: 235
-- Data for Name: workspace_files; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.workspace_files (id, workspace_id, parent_id, name, original_name, file_path, file_size, mime_type, file_hash, is_directory, file_extension, file_metadata, description, is_deleted, is_public, version, version_of, uploaded_by, uploaded_at, modified_by, modified_at) VALUES ('6c391a49-88d1-402b-b64f-bfdcd1f45c93', '21ee03db-90c4-4592-b00f-c44801e0b164', NULL, 'test2', 'test2', '/', 0, 'inode/directory', NULL, true, NULL, '{}', NULL, false, false, 1, NULL, '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-06-26 22:40:49.602836+09', NULL, NULL);


--
-- TOC entry 5297 (class 0 OID 19980)
-- Dependencies: 236
-- Data for Name: workspace_groups; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.workspace_groups (id, workspace_id, group_name, group_display_name, permission_level, created_by, created_at, group_id_uuid, group_info_updated_at, updated_at) VALUES ('197ff135-85e6-40ed-b582-d79fa6ab104b', '21ee03db-90c4-4592-b00f-c44801e0b164', 'test_a', 'test_a', 'read', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-21 14:40:49.082+09', '125006d1-4ed3-4e6e-87a3-2649a808901c', NULL, NULL);
INSERT INTO public.workspace_groups (id, workspace_id, group_name, group_display_name, permission_level, created_by, created_at, group_id_uuid, group_info_updated_at, updated_at) VALUES ('6cdfbf73-8786-4d6f-87b8-81bea5d0f17a', '594c3e96-8261-405a-8df2-cf2ccc4062d9', 'mz', 'mz', 'read', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-29 17:34:30.398338+09', 'beca8a98-a577-4599-b34e-352200178ba2', NULL, NULL);


--
-- TOC entry 5298 (class 0 OID 19986)
-- Dependencies: 237
-- Data for Name: workspace_users; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.workspace_users (id, workspace_id, user_id, user_display_name, permission_level, created_by, created_at, user_id_uuid, user_email, user_info_updated_at, updated_at) VALUES ('ef8742bf-62b7-49c1-acc0-3d34a7872cb8', '594c3e96-8261-405a-8df2-cf2ccc4062d9', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', 'admin', 'read', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-21 12:40:01.85219+09', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', 'admin@test.com', NULL, NULL);
INSERT INTO public.workspace_users (id, workspace_id, user_id, user_display_name, permission_level, created_by, created_at, user_id_uuid, user_email, user_info_updated_at, updated_at) VALUES ('1a9a2525-5920-46fd-a975-82735134e47c', '21ee03db-90c4-4592-b00f-c44801e0b164', 'd65db892-9691-46e3-a2c6-d962980f2f51', '카리나', 'read', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-21 14:41:16.686256+09', 'd65db892-9691-46e3-a2c6-d962980f2f51', 'krn@test.com', NULL, NULL);
INSERT INTO public.workspace_users (id, workspace_id, user_id, user_display_name, permission_level, created_by, created_at, user_id_uuid, user_email, user_info_updated_at, updated_at) VALUES ('1a504ba2-5d74-4065-98d2-04c8dfe0063d', 'c3296531-4c75-4547-99b2-a6635e54fc87', '62194e4e-247e-405f-b5ce-4d831792233f', '마감이', 'read', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-21 16:56:18.98019+09', '62194e4e-247e-405f-b5ce-4d831792233f', 'mg@test.com', NULL, NULL);
INSERT INTO public.workspace_users (id, workspace_id, user_id, user_display_name, permission_level, created_by, created_at, user_id_uuid, user_email, user_info_updated_at, updated_at) VALUES ('901519e3-6ea1-4022-b851-1f53ee846165', '594c3e96-8261-405a-8df2-cf2ccc4062d9', 'd65db892-9691-46e3-a2c6-d962980f2f51', '카리나', 'read', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-29 17:34:46.811235+09', 'd65db892-9691-46e3-a2c6-d962980f2f51', 'krn@test.com', NULL, NULL);


--
-- TOC entry 5299 (class 0 OID 19992)
-- Dependencies: 238
-- Data for Name: workspaces; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.workspaces (id, name, slug, description, is_active, settings, created_by, updated_by, created_at, updated_at, workspace_type, owner_type, owner_id, parent_id, path, is_folder) VALUES ('594c3e96-8261-405a-8df2-cf2ccc4062d9', 'ProductionManagement', 'productionmanagement', '', true, '{}', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-01 23:00:36.291733+09', NULL, 'PERSONAL', 'USER', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', NULL, '/', false);
INSERT INTO public.workspaces (id, name, slug, description, is_active, settings, created_by, updated_by, created_at, updated_at, workspace_type, owner_type, owner_id, parent_id, path, is_folder) VALUES ('21ee03db-90c4-4592-b00f-c44801e0b164', 'Chemical_Iksan_AI_Infrapart', 'personaltest', '', true, '{}', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-06-26 22:33:54.447636+09', '2025-07-07 22:07:59.031408+09', 'PERSONAL', 'USER', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', NULL, '/', false);
INSERT INTO public.workspaces (id, name, slug, description, is_active, settings, created_by, updated_by, created_at, updated_at, workspace_type, owner_type, owner_id, parent_id, path, is_folder) VALUES ('4b624c81-1ab5-4c29-90aa-024a8bb034fe', 'for_is_ch', 'forisch', '', false, '{}', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-06-29 00:05:16.065726+09', '2025-07-07 22:08:24.38692+09', 'GROUP', 'GROUP', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', NULL, '/', false);
INSERT INTO public.workspaces (id, name, slug, description, is_active, settings, created_by, updated_by, created_at, updated_at, workspace_type, owner_type, owner_id, parent_id, path, is_folder) VALUES ('c3296531-4c75-4547-99b2-a6635e54fc87', 'Group_Test', 'grouptest', '', true, '{}', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-18 08:05:04.196361+09', NULL, 'GROUP', 'GROUP', '개발팀', NULL, '/', false);
INSERT INTO public.workspaces (id, name, slug, description, is_active, settings, created_by, updated_by, created_at, updated_at, workspace_type, owner_type, owner_id, parent_id, path, is_folder) VALUES ('5b4d5c82-c625-46fa-91f8-776975374d5d', 'Public workspace', 'public_workspace', 'Public workspace for Total Monitoring system', true, NULL, 'system', NULL, '2025-07-28 16:13:27.731787+09', NULL, 'PUBLIC', 'USER', 'system', NULL, '/', false);


--
-- TOC entry 5304 (class 0 OID 21138)
-- Dependencies: 243
-- Data for Name: migration_metadata; Type: TABLE DATA; Schema: workspace_backup; Owner: postgres
--

INSERT INTO workspace_backup.migration_metadata (id, backup_date, table_name, record_count, migration_version, notes) VALUES (1, '2025-07-21 12:15:00.486681+09', 'workspace_users', 2, 'pre-uuid-migration', 'Backup before UUID migration');
INSERT INTO workspace_backup.migration_metadata (id, backup_date, table_name, record_count, migration_version, notes) VALUES (2, '2025-07-21 12:15:00.487854+09', 'workspace_groups', 7, 'pre-uuid-migration', 'Backup before UUID migration');


--
-- TOC entry 5302 (class 0 OID 21132)
-- Dependencies: 241
-- Data for Name: workspace_groups_backup; Type: TABLE DATA; Schema: workspace_backup; Owner: postgres
--

INSERT INTO workspace_backup.workspace_groups_backup (id, workspace_id, group_name, group_display_name, permission_level, created_by, created_at, group_id_uuid, group_info_updated_at, updated_at) VALUES ('7b02d9cd-d1a4-4978-a3c3-fa9084ebe1fe', '21ee03db-90c4-4592-b00f-c44801e0b164', '개발팀', NULL, 'read', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-06-29 21:42:46.16532+09', NULL, NULL, '2025-07-18 08:37:27.377166+09');
INSERT INTO workspace_backup.workspace_groups_backup (id, workspace_id, group_name, group_display_name, permission_level, created_by, created_at, group_id_uuid, group_info_updated_at, updated_at) VALUES ('fb687ed1-e8e9-4a1e-ab15-b26c5e736b47', 'c3296531-4c75-4547-99b2-a6635e54fc87', '임시 사용자', NULL, 'read', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-18 08:05:04.196361+09', NULL, NULL, '2025-07-18 08:37:27.377166+09');
INSERT INTO workspace_backup.workspace_groups_backup (id, workspace_id, group_name, group_display_name, permission_level, created_by, created_at, group_id_uuid, group_info_updated_at, updated_at) VALUES ('032b7b8b-d84c-4ff1-9b77-f20f8750ebaa', 'c3296531-4c75-4547-99b2-a6635e54fc87', '개발팀', NULL, 'read', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-18 08:05:15.724421+09', NULL, NULL, '2025-07-18 08:37:27.377166+09');
INSERT INTO workspace_backup.workspace_groups_backup (id, workspace_id, group_name, group_display_name, permission_level, created_by, created_at, group_id_uuid, group_info_updated_at, updated_at) VALUES ('668f6dd0-fd8f-4e8f-8de9-05550ad6a4a1', '21ee03db-90c4-4592-b00f-c44801e0b164', '0b9e7be8-e32d-5e6c-a60d-993af78b5a21', '0b9e7be8-e32d-5e6c-a60d-993af78b5a21', 'read', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-21 11:24:37.613729+09', '0b9e7be8-e32d-5e6c-a60d-993af78b5a21', NULL, NULL);
INSERT INTO workspace_backup.workspace_groups_backup (id, workspace_id, group_name, group_display_name, permission_level, created_by, created_at, group_id_uuid, group_info_updated_at, updated_at) VALUES ('803ac135-f928-4677-bf8f-0755a8c548c7', '21ee03db-90c4-4592-b00f-c44801e0b164', '3ab3b962-06b7-5e15-a490-52affa32e6dc', '3ab3b962-06b7-5e15-a490-52affa32e6dc', 'read', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-21 11:24:48.7062+09', '3ab3b962-06b7-5e15-a490-52affa32e6dc', NULL, NULL);
INSERT INTO workspace_backup.workspace_groups_backup (id, workspace_id, group_name, group_display_name, permission_level, created_by, created_at, group_id_uuid, group_info_updated_at, updated_at) VALUES ('503fcdfc-6d38-4ade-b9c3-0ea2e7610794', '594c3e96-8261-405a-8df2-cf2ccc4062d9', '0b9e7be8-e32d-5e6c-a60d-993af78b5a21', '0b9e7be8-e32d-5e6c-a60d-993af78b5a21', 'read', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-21 11:34:23.351392+09', '0b9e7be8-e32d-5e6c-a60d-993af78b5a21', NULL, NULL);
INSERT INTO workspace_backup.workspace_groups_backup (id, workspace_id, group_name, group_display_name, permission_level, created_by, created_at, group_id_uuid, group_info_updated_at, updated_at) VALUES ('8a6e0a5b-db52-4d6c-8e06-a0ff9d6e8faa', '594c3e96-8261-405a-8df2-cf2ccc4062d9', '58ba91a5-0cba-563c-b2c3-8de00eb4b3b6', '58ba91a5-0cba-563c-b2c3-8de00eb4b3b6', 'read', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-21 11:34:25.809927+09', '58ba91a5-0cba-563c-b2c3-8de00eb4b3b6', NULL, NULL);


--
-- TOC entry 5301 (class 0 OID 21127)
-- Dependencies: 240
-- Data for Name: workspace_users_backup; Type: TABLE DATA; Schema: workspace_backup; Owner: postgres
--

INSERT INTO workspace_backup.workspace_users_backup (id, workspace_id, user_id, user_display_name, permission_level, created_by, created_at, user_id_uuid, user_email, user_info_updated_at, updated_at) VALUES ('e612d5f8-93e2-4f45-b298-4d1f779bc0ff', '594c3e96-8261-405a-8df2-cf2ccc4062d9', 'admin@test.com', NULL, 'read', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-01 23:00:36.291733+09', NULL, NULL, NULL, '2025-07-18 08:37:27.377166+09');
INSERT INTO workspace_backup.workspace_users_backup (id, workspace_id, user_id, user_display_name, permission_level, created_by, created_at, user_id_uuid, user_email, user_info_updated_at, updated_at) VALUES ('970a0fd6-686e-4eea-8dad-53dbd377ce37', '594c3e96-8261-405a-8df2-cf2ccc4062d9', 'lee@test.com', NULL, 'read', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-10 10:33:40.759704+09', NULL, NULL, NULL, '2025-07-18 08:37:27.377166+09');


--
-- TOC entry 5406 (class 0 OID 0)
-- Dependencies: 230
-- Name: personal_test_measurement_data_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.personal_test_measurement_data_id_seq', 20, true);


--
-- TOC entry 5407 (class 0 OID 0)
-- Dependencies: 242
-- Name: migration_metadata_id_seq; Type: SEQUENCE SET; Schema: workspace_backup; Owner: postgres
--

SELECT pg_catalog.setval('workspace_backup.migration_metadata_id_seq', 2, true);


--
-- TOC entry 4915 (class 2606 OID 20013)
-- Name: alembic_version alembic_version_pkc; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.alembic_version
    ADD CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num);


--
-- TOC entry 4917 (class 2606 OID 20015)
-- Name: api_endpoint_mappings api_endpoint_mappings_config_id_data_type_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.api_endpoint_mappings
    ADD CONSTRAINT api_endpoint_mappings_config_id_data_type_key UNIQUE (config_id, data_type);


--
-- TOC entry 4919 (class 2606 OID 20017)
-- Name: api_endpoint_mappings api_endpoint_mappings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.api_endpoint_mappings
    ADD CONSTRAINT api_endpoint_mappings_pkey PRIMARY KEY (id);


--
-- TOC entry 4922 (class 2606 OID 20019)
-- Name: data_source_configs data_source_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.data_source_configs
    ADD CONSTRAINT data_source_configs_pkey PRIMARY KEY (id);


--
-- TOC entry 4924 (class 2606 OID 20021)
-- Name: data_source_configs data_source_configs_workspace_id_config_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.data_source_configs
    ADD CONSTRAINT data_source_configs_workspace_id_config_name_key UNIQUE (workspace_id, config_name);


--
-- TOC entry 4927 (class 2606 OID 20023)
-- Name: data_source_endpoint_mappings data_source_endpoint_mappings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.data_source_endpoint_mappings
    ADD CONSTRAINT data_source_endpoint_mappings_pkey PRIMARY KEY (id);


--
-- TOC entry 4931 (class 2606 OID 20025)
-- Name: data_source_field_mappings data_source_field_mappings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.data_source_field_mappings
    ADD CONSTRAINT data_source_field_mappings_pkey PRIMARY KEY (id);


--
-- TOC entry 4935 (class 2606 OID 20027)
-- Name: data_source_mappings data_source_mappings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.data_source_mappings
    ADD CONSTRAINT data_source_mappings_pkey PRIMARY KEY (id);


--
-- TOC entry 4939 (class 2606 OID 20029)
-- Name: file_shares file_shares_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.file_shares
    ADD CONSTRAINT file_shares_pkey PRIMARY KEY (id);


--
-- TOC entry 4941 (class 2606 OID 20031)
-- Name: file_shares file_shares_share_token_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.file_shares
    ADD CONSTRAINT file_shares_share_token_key UNIQUE (share_token);


--
-- TOC entry 4948 (class 2606 OID 20033)
-- Name: measurement_specs measurement_specs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.measurement_specs
    ADD CONSTRAINT measurement_specs_pkey PRIMARY KEY (measurement_code);


--
-- TOC entry 5097 (class 2606 OID 21535)
-- Name: mvp_module_group_access mvp_module_group_access_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.mvp_module_group_access
    ADD CONSTRAINT mvp_module_group_access_pkey PRIMARY KEY (id);


--
-- TOC entry 4954 (class 2606 OID 20035)
-- Name: mvp_module_logs mvp_module_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.mvp_module_logs
    ADD CONSTRAINT mvp_module_logs_pkey PRIMARY KEY (id);


--
-- TOC entry 5090 (class 2606 OID 21516)
-- Name: mvp_module_user_access mvp_module_user_access_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.mvp_module_user_access
    ADD CONSTRAINT mvp_module_user_access_pkey PRIMARY KEY (id);


--
-- TOC entry 4962 (class 2606 OID 20037)
-- Name: mvp_modules mvp_modules_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.mvp_modules
    ADD CONSTRAINT mvp_modules_pkey PRIMARY KEY (id);


--
-- TOC entry 4965 (class 2606 OID 20039)
-- Name: personal_test_equipment_status personal_test_equipment_status_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.personal_test_equipment_status
    ADD CONSTRAINT personal_test_equipment_status_pkey PRIMARY KEY (equipment_code);


--
-- TOC entry 4969 (class 2606 OID 20041)
-- Name: personal_test_measurement_data personal_test_measurement_data_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.personal_test_measurement_data
    ADD CONSTRAINT personal_test_measurement_data_pkey PRIMARY KEY (id);


--
-- TOC entry 4974 (class 2606 OID 20043)
-- Name: personal_test_process_flow_versions personal_test_process_flow_versions_flow_id_version_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.personal_test_process_flow_versions
    ADD CONSTRAINT personal_test_process_flow_versions_flow_id_version_number_key UNIQUE (flow_id, version_number);


--
-- TOC entry 4976 (class 2606 OID 20045)
-- Name: personal_test_process_flow_versions personal_test_process_flow_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.personal_test_process_flow_versions
    ADD CONSTRAINT personal_test_process_flow_versions_pkey PRIMARY KEY (id);


--
-- TOC entry 4978 (class 2606 OID 20047)
-- Name: personal_test_process_flow_versions personal_test_process_flow_versions_publish_token_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.personal_test_process_flow_versions
    ADD CONSTRAINT personal_test_process_flow_versions_publish_token_key UNIQUE (publish_token);


--
-- TOC entry 4988 (class 2606 OID 20049)
-- Name: personal_test_process_flows personal_test_process_flows_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.personal_test_process_flows
    ADD CONSTRAINT personal_test_process_flows_pkey PRIMARY KEY (id);


--
-- TOC entry 4990 (class 2606 OID 20051)
-- Name: personal_test_process_flows personal_test_process_flows_publish_token_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.personal_test_process_flows
    ADD CONSTRAINT personal_test_process_flows_publish_token_key UNIQUE (publish_token);


--
-- TOC entry 5025 (class 2606 OID 20191)
-- Name: status_mappings status_mappings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.status_mappings
    ADD CONSTRAINT status_mappings_pkey PRIMARY KEY (id);


--
-- TOC entry 5034 (class 2606 OID 21367)
-- Name: total_monitoring_database_connections total_monitoring_database_con_workspace_id_groupid_connecti_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.total_monitoring_database_connections
    ADD CONSTRAINT total_monitoring_database_con_workspace_id_groupid_connecti_key UNIQUE (workspace_id, groupid, connection_name);


--
-- TOC entry 5036 (class 2606 OID 21365)
-- Name: total_monitoring_database_connections total_monitoring_database_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.total_monitoring_database_connections
    ADD CONSTRAINT total_monitoring_database_connections_pkey PRIMARY KEY (id);


--
-- TOC entry 5049 (class 2606 OID 21408)
-- Name: total_monitoring_equipment_nodes total_monitoring_equipment_no_workspace_id_groupid_flow_id__key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.total_monitoring_equipment_nodes
    ADD CONSTRAINT total_monitoring_equipment_no_workspace_id_groupid_flow_id__key UNIQUE (workspace_id, groupid, flow_id, node_id);


--
-- TOC entry 5051 (class 2606 OID 21406)
-- Name: total_monitoring_equipment_nodes total_monitoring_equipment_nodes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.total_monitoring_equipment_nodes
    ADD CONSTRAINT total_monitoring_equipment_nodes_pkey PRIMARY KEY (id);


--
-- TOC entry 5056 (class 2606 OID 21430)
-- Name: total_monitoring_instrument_nodes total_monitoring_instrument_n_workspace_id_groupid_flow_id__key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.total_monitoring_instrument_nodes
    ADD CONSTRAINT total_monitoring_instrument_n_workspace_id_groupid_flow_id__key UNIQUE (workspace_id, groupid, flow_id, node_id);


--
-- TOC entry 5058 (class 2606 OID 21428)
-- Name: total_monitoring_instrument_nodes total_monitoring_instrument_nodes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.total_monitoring_instrument_nodes
    ADD CONSTRAINT total_monitoring_instrument_nodes_pkey PRIMARY KEY (id);


--
-- TOC entry 5042 (class 2606 OID 21384)
-- Name: total_monitoring_process_flows total_monitoring_process_flow_workspace_id_groupid_flow_nam_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.total_monitoring_process_flows
    ADD CONSTRAINT total_monitoring_process_flow_workspace_id_groupid_flow_nam_key UNIQUE (workspace_id, groupid, flow_name);


--
-- TOC entry 5044 (class 2606 OID 21382)
-- Name: total_monitoring_process_flows total_monitoring_process_flows_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.total_monitoring_process_flows
    ADD CONSTRAINT total_monitoring_process_flows_pkey PRIMARY KEY (id);


--
-- TOC entry 5064 (class 2606 OID 21452)
-- Name: total_monitoring_published_flows total_monitoring_published_fl_workspace_id_groupid_publishe_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.total_monitoring_published_flows
    ADD CONSTRAINT total_monitoring_published_fl_workspace_id_groupid_publishe_key UNIQUE (workspace_id, groupid, published_name);


--
-- TOC entry 5066 (class 2606 OID 21450)
-- Name: total_monitoring_published_flows total_monitoring_published_flows_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.total_monitoring_published_flows
    ADD CONSTRAINT total_monitoring_published_flows_pkey PRIMARY KEY (id);


--
-- TOC entry 5068 (class 2606 OID 21454)
-- Name: total_monitoring_published_flows total_monitoring_published_flows_publish_token_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.total_monitoring_published_flows
    ADD CONSTRAINT total_monitoring_published_flows_publish_token_key UNIQUE (publish_token);


--
-- TOC entry 5073 (class 2606 OID 21477)
-- Name: total_monitoring_query_templates total_monitoring_query_templa_workspace_id_groupid_template_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.total_monitoring_query_templates
    ADD CONSTRAINT total_monitoring_query_templa_workspace_id_groupid_template_key UNIQUE (workspace_id, groupid, template_name);


--
-- TOC entry 5075 (class 2606 OID 21475)
-- Name: total_monitoring_query_templates total_monitoring_query_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.total_monitoring_query_templates
    ADD CONSTRAINT total_monitoring_query_templates_pkey PRIMARY KEY (id);


--
-- TOC entry 5080 (class 2606 OID 21494)
-- Name: total_monitoring_workspace_features total_monitoring_workspace_featur_workspace_id_feature_slug_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.total_monitoring_workspace_features
    ADD CONSTRAINT total_monitoring_workspace_featur_workspace_id_feature_slug_key UNIQUE (workspace_id, feature_slug);


--
-- TOC entry 5082 (class 2606 OID 21492)
-- Name: total_monitoring_workspace_features total_monitoring_workspace_features_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.total_monitoring_workspace_features
    ADD CONSTRAINT total_monitoring_workspace_features_pkey PRIMARY KEY (id);


--
-- TOC entry 4933 (class 2606 OID 20053)
-- Name: data_source_field_mappings unique_field_mapping; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.data_source_field_mappings
    ADD CONSTRAINT unique_field_mapping UNIQUE (data_source_id, data_type, target_field);


--
-- TOC entry 4937 (class 2606 OID 20055)
-- Name: data_source_mappings unique_mapping; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.data_source_mappings
    ADD CONSTRAINT unique_mapping UNIQUE (workspace_id, data_source_id, mapping_type, source_code);


--
-- TOC entry 4929 (class 2606 OID 20057)
-- Name: data_source_endpoint_mappings unique_source_type; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.data_source_endpoint_mappings
    ADD CONSTRAINT unique_source_type UNIQUE (data_source_id, data_type);


--
-- TOC entry 5027 (class 2606 OID 20193)
-- Name: status_mappings unique_workspace_source_datasource; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.status_mappings
    ADD CONSTRAINT unique_workspace_source_datasource UNIQUE (workspace_id, source_status, data_source_type);


--
-- TOC entry 5107 (class 2606 OID 21732)
-- Name: user_sessions user_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_pkey PRIMARY KEY (session_id);


--
-- TOC entry 5000 (class 2606 OID 20059)
-- Name: workspace_files workspace_files_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workspace_files
    ADD CONSTRAINT workspace_files_pkey PRIMARY KEY (id);


--
-- TOC entry 5007 (class 2606 OID 20061)
-- Name: workspace_groups workspace_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workspace_groups
    ADD CONSTRAINT workspace_groups_pkey PRIMARY KEY (id);


--
-- TOC entry 5014 (class 2606 OID 20063)
-- Name: workspace_users workspace_users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workspace_users
    ADD CONSTRAINT workspace_users_pkey PRIMARY KEY (id);


--
-- TOC entry 5022 (class 2606 OID 20065)
-- Name: workspaces workspaces_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workspaces
    ADD CONSTRAINT workspaces_pkey PRIMARY KEY (id);


--
-- TOC entry 5029 (class 2606 OID 21146)
-- Name: migration_metadata migration_metadata_pkey; Type: CONSTRAINT; Schema: workspace_backup; Owner: postgres
--

ALTER TABLE ONLY workspace_backup.migration_metadata
    ADD CONSTRAINT migration_metadata_pkey PRIMARY KEY (id);


--
-- TOC entry 4920 (class 1259 OID 20066)
-- Name: idx_api_endpoint_mappings_config; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_api_endpoint_mappings_config ON public.api_endpoint_mappings USING btree (config_id, data_type);


--
-- TOC entry 4925 (class 1259 OID 20067)
-- Name: idx_data_source_configs_workspace; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_data_source_configs_workspace ON public.data_source_configs USING btree (workspace_id, is_active);


--
-- TOC entry 4942 (class 1259 OID 20068)
-- Name: idx_file_share_expires; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_file_share_expires ON public.file_shares USING btree (expires_at);


--
-- TOC entry 4943 (class 1259 OID 20069)
-- Name: idx_file_share_file; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_file_share_file ON public.file_shares USING btree (file_id);


--
-- TOC entry 4944 (class 1259 OID 20070)
-- Name: idx_file_share_token; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_file_share_token ON public.file_shares USING btree (share_token);


--
-- TOC entry 4970 (class 1259 OID 20071)
-- Name: idx_flow_versions_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_flow_versions_created_at ON public.personal_test_process_flow_versions USING btree (created_at);


--
-- TOC entry 4971 (class 1259 OID 20072)
-- Name: idx_flow_versions_flow_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_flow_versions_flow_id ON public.personal_test_process_flow_versions USING btree (flow_id);


--
-- TOC entry 4972 (class 1259 OID 20073)
-- Name: idx_flow_versions_published; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_flow_versions_published ON public.personal_test_process_flow_versions USING btree (is_published) WHERE (is_published = true);


--
-- TOC entry 4979 (class 1259 OID 21616)
-- Name: idx_flows_scope_access; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_flows_scope_access ON public.personal_test_process_flows USING btree (workspace_id, scope_type, created_by, shared_with_workspace);


--
-- TOC entry 4980 (class 1259 OID 21614)
-- Name: idx_flows_scope_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_flows_scope_user ON public.personal_test_process_flows USING btree (created_by, scope_type);


--
-- TOC entry 4981 (class 1259 OID 21613)
-- Name: idx_flows_scope_workspace; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_flows_scope_workspace ON public.personal_test_process_flows USING btree (workspace_id, scope_type);


--
-- TOC entry 4982 (class 1259 OID 21615)
-- Name: idx_flows_shared; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_flows_shared ON public.personal_test_process_flows USING btree (workspace_id, shared_with_workspace) WHERE (shared_with_workspace = true);


--
-- TOC entry 4946 (class 1259 OID 20074)
-- Name: idx_measurement_specs_code; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_measurement_specs_code ON public.measurement_specs USING btree (measurement_code);


--
-- TOC entry 4955 (class 1259 OID 20075)
-- Name: idx_mvp_module_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_mvp_module_active ON public.mvp_modules USING btree (is_active);


--
-- TOC entry 5091 (class 1259 OID 21543)
-- Name: idx_mvp_module_group_access_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_mvp_module_group_access_active ON public.mvp_module_group_access USING btree (is_active);


--
-- TOC entry 5092 (class 1259 OID 21542)
-- Name: idx_mvp_module_group_access_group; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_mvp_module_group_access_group ON public.mvp_module_group_access USING btree (group_uuid);


--
-- TOC entry 5093 (class 1259 OID 21541)
-- Name: idx_mvp_module_group_access_module; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_mvp_module_group_access_module ON public.mvp_module_group_access USING btree (module_id);


--
-- TOC entry 5094 (class 1259 OID 21544)
-- Name: idx_mvp_module_group_access_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_mvp_module_group_access_unique ON public.mvp_module_group_access USING btree (module_id, group_uuid) WHERE (is_active = true);


--
-- TOC entry 4956 (class 1259 OID 20076)
-- Name: idx_mvp_module_installed; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_mvp_module_installed ON public.mvp_modules USING btree (is_installed);


--
-- TOC entry 4949 (class 1259 OID 20077)
-- Name: idx_mvp_module_log_action; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_mvp_module_log_action ON public.mvp_module_logs USING btree (action);


--
-- TOC entry 4950 (class 1259 OID 20078)
-- Name: idx_mvp_module_log_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_mvp_module_log_created_at ON public.mvp_module_logs USING btree (created_at);


--
-- TOC entry 4951 (class 1259 OID 20079)
-- Name: idx_mvp_module_log_module; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_mvp_module_log_module ON public.mvp_module_logs USING btree (module_id);


--
-- TOC entry 4957 (class 1259 OID 20080)
-- Name: idx_mvp_module_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_mvp_module_name ON public.mvp_modules USING btree (module_name);


--
-- TOC entry 4958 (class 1259 OID 20081)
-- Name: idx_mvp_module_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_mvp_module_unique ON public.mvp_modules USING btree (workspace_id, module_name);


--
-- TOC entry 5083 (class 1259 OID 21525)
-- Name: idx_mvp_module_user_access_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_mvp_module_user_access_active ON public.mvp_module_user_access USING btree (is_active);


--
-- TOC entry 5084 (class 1259 OID 21526)
-- Name: idx_mvp_module_user_access_expires; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_mvp_module_user_access_expires ON public.mvp_module_user_access USING btree (expires_at);


--
-- TOC entry 5085 (class 1259 OID 21522)
-- Name: idx_mvp_module_user_access_module; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_mvp_module_user_access_module ON public.mvp_module_user_access USING btree (module_id);


--
-- TOC entry 5086 (class 1259 OID 21527)
-- Name: idx_mvp_module_user_access_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_mvp_module_user_access_unique ON public.mvp_module_user_access USING btree (module_id, user_uuid) WHERE (is_active = true);


--
-- TOC entry 5087 (class 1259 OID 21523)
-- Name: idx_mvp_module_user_access_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_mvp_module_user_access_user ON public.mvp_module_user_access USING btree (user_uuid);


--
-- TOC entry 4959 (class 1259 OID 20082)
-- Name: idx_mvp_module_workspace; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_mvp_module_workspace ON public.mvp_modules USING btree (workspace_id);


--
-- TOC entry 4963 (class 1259 OID 20083)
-- Name: idx_personal_test_equipment_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_personal_test_equipment_status ON public.personal_test_equipment_status USING btree (equipment_type, status);


--
-- TOC entry 4983 (class 1259 OID 20084)
-- Name: idx_personal_test_flows_publish_token; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_personal_test_flows_publish_token ON public.personal_test_process_flows USING btree (publish_token) WHERE (is_published = true);


--
-- TOC entry 4984 (class 1259 OID 20085)
-- Name: idx_personal_test_flows_published; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_personal_test_flows_published ON public.personal_test_process_flows USING btree (is_published, published_at DESC) WHERE (is_published = true);


--
-- TOC entry 4985 (class 1259 OID 20086)
-- Name: idx_personal_test_flows_updated; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_personal_test_flows_updated ON public.personal_test_process_flows USING btree (updated_at DESC);


--
-- TOC entry 4986 (class 1259 OID 20087)
-- Name: idx_personal_test_flows_workspace; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_personal_test_flows_workspace ON public.personal_test_process_flows USING btree (workspace_id);


--
-- TOC entry 4966 (class 1259 OID 20088)
-- Name: idx_personal_test_measurements_equipment; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_personal_test_measurements_equipment ON public.personal_test_measurement_data USING btree (equipment_code, "timestamp" DESC);


--
-- TOC entry 4967 (class 1259 OID 20089)
-- Name: idx_personal_test_measurements_time; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_personal_test_measurements_time ON public.personal_test_measurement_data USING btree ("timestamp" DESC);


--
-- TOC entry 5023 (class 1259 OID 20194)
-- Name: idx_status_mappings_workspace_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_status_mappings_workspace_active ON public.status_mappings USING btree (workspace_id, is_active);


--
-- TOC entry 5030 (class 1259 OID 21375)
-- Name: idx_total_monitoring_db_conn_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_total_monitoring_db_conn_active ON public.total_monitoring_database_connections USING btree (is_active);


--
-- TOC entry 5031 (class 1259 OID 21374)
-- Name: idx_total_monitoring_db_conn_group; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_total_monitoring_db_conn_group ON public.total_monitoring_database_connections USING btree (groupid);


--
-- TOC entry 5032 (class 1259 OID 21373)
-- Name: idx_total_monitoring_db_conn_workspace; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_total_monitoring_db_conn_workspace ON public.total_monitoring_database_connections USING btree (workspace_id);


--
-- TOC entry 5045 (class 1259 OID 21421)
-- Name: idx_total_monitoring_equipment_flow; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_total_monitoring_equipment_flow ON public.total_monitoring_equipment_nodes USING btree (flow_id);


--
-- TOC entry 5046 (class 1259 OID 21420)
-- Name: idx_total_monitoring_equipment_group; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_total_monitoring_equipment_group ON public.total_monitoring_equipment_nodes USING btree (groupid);


--
-- TOC entry 5047 (class 1259 OID 21419)
-- Name: idx_total_monitoring_equipment_workspace; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_total_monitoring_equipment_workspace ON public.total_monitoring_equipment_nodes USING btree (workspace_id);


--
-- TOC entry 5076 (class 1259 OID 21501)
-- Name: idx_total_monitoring_features_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_total_monitoring_features_active ON public.total_monitoring_workspace_features USING btree (is_active);


--
-- TOC entry 5077 (class 1259 OID 21502)
-- Name: idx_total_monitoring_features_implemented; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_total_monitoring_features_implemented ON public.total_monitoring_workspace_features USING btree (is_implemented);


--
-- TOC entry 5078 (class 1259 OID 21500)
-- Name: idx_total_monitoring_features_workspace; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_total_monitoring_features_workspace ON public.total_monitoring_workspace_features USING btree (workspace_id);


--
-- TOC entry 5037 (class 1259 OID 21396)
-- Name: idx_total_monitoring_flows_group; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_total_monitoring_flows_group ON public.total_monitoring_process_flows USING btree (groupid);


--
-- TOC entry 5038 (class 1259 OID 21397)
-- Name: idx_total_monitoring_flows_published; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_total_monitoring_flows_published ON public.total_monitoring_process_flows USING btree (is_published);


--
-- TOC entry 5039 (class 1259 OID 21398)
-- Name: idx_total_monitoring_flows_token; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_total_monitoring_flows_token ON public.total_monitoring_process_flows USING btree (publish_token);


--
-- TOC entry 5040 (class 1259 OID 21395)
-- Name: idx_total_monitoring_flows_workspace; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_total_monitoring_flows_workspace ON public.total_monitoring_process_flows USING btree (workspace_id);


--
-- TOC entry 5052 (class 1259 OID 21443)
-- Name: idx_total_monitoring_instrument_flow; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_total_monitoring_instrument_flow ON public.total_monitoring_instrument_nodes USING btree (flow_id);


--
-- TOC entry 5053 (class 1259 OID 21442)
-- Name: idx_total_monitoring_instrument_group; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_total_monitoring_instrument_group ON public.total_monitoring_instrument_nodes USING btree (groupid);


--
-- TOC entry 5054 (class 1259 OID 21441)
-- Name: idx_total_monitoring_instrument_workspace; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_total_monitoring_instrument_workspace ON public.total_monitoring_instrument_nodes USING btree (workspace_id);


--
-- TOC entry 5059 (class 1259 OID 21468)
-- Name: idx_total_monitoring_published_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_total_monitoring_published_active ON public.total_monitoring_published_flows USING btree (is_active);


--
-- TOC entry 5060 (class 1259 OID 21466)
-- Name: idx_total_monitoring_published_group; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_total_monitoring_published_group ON public.total_monitoring_published_flows USING btree (groupid);


--
-- TOC entry 5061 (class 1259 OID 21467)
-- Name: idx_total_monitoring_published_token; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_total_monitoring_published_token ON public.total_monitoring_published_flows USING btree (publish_token);


--
-- TOC entry 5062 (class 1259 OID 21465)
-- Name: idx_total_monitoring_published_workspace; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_total_monitoring_published_workspace ON public.total_monitoring_published_flows USING btree (workspace_id);


--
-- TOC entry 5069 (class 1259 OID 21484)
-- Name: idx_total_monitoring_query_templates_group; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_total_monitoring_query_templates_group ON public.total_monitoring_query_templates USING btree (groupid);


--
-- TOC entry 5070 (class 1259 OID 21485)
-- Name: idx_total_monitoring_query_templates_system; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_total_monitoring_query_templates_system ON public.total_monitoring_query_templates USING btree (is_system_template);


--
-- TOC entry 5071 (class 1259 OID 21483)
-- Name: idx_total_monitoring_query_templates_workspace; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_total_monitoring_query_templates_workspace ON public.total_monitoring_query_templates USING btree (workspace_id);


--
-- TOC entry 5098 (class 1259 OID 21737)
-- Name: idx_user_sessions_expires; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_sessions_expires ON public.user_sessions USING btree (expires_at);


--
-- TOC entry 5099 (class 1259 OID 21740)
-- Name: idx_user_sessions_jwt; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_sessions_jwt ON public.user_sessions USING btree (jwt_token_id);


--
-- TOC entry 5100 (class 1259 OID 21738)
-- Name: idx_user_sessions_last_accessed; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_sessions_last_accessed ON public.user_sessions USING btree (last_accessed);


--
-- TOC entry 5101 (class 1259 OID 21734)
-- Name: idx_user_sessions_user_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_sessions_user_active ON public.user_sessions USING btree (user_id, is_active);


--
-- TOC entry 5015 (class 1259 OID 20090)
-- Name: idx_workspace_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_workspace_active ON public.workspaces USING btree (is_active);


--
-- TOC entry 5016 (class 1259 OID 20091)
-- Name: idx_workspace_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_workspace_created_at ON public.workspaces USING btree (created_at);


--
-- TOC entry 5017 (class 1259 OID 20092)
-- Name: idx_workspace_created_by; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_workspace_created_by ON public.workspaces USING btree (created_by);


--
-- TOC entry 4991 (class 1259 OID 20093)
-- Name: idx_workspace_file_is_deleted; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_workspace_file_is_deleted ON public.workspace_files USING btree (is_deleted);


--
-- TOC entry 4992 (class 1259 OID 20094)
-- Name: idx_workspace_file_mime_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_workspace_file_mime_type ON public.workspace_files USING btree (mime_type);


--
-- TOC entry 4993 (class 1259 OID 20095)
-- Name: idx_workspace_file_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_workspace_file_name ON public.workspace_files USING btree (name);


--
-- TOC entry 4994 (class 1259 OID 20096)
-- Name: idx_workspace_file_parent; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_workspace_file_parent ON public.workspace_files USING btree (parent_id);


--
-- TOC entry 4995 (class 1259 OID 20097)
-- Name: idx_workspace_file_uploaded_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_workspace_file_uploaded_at ON public.workspace_files USING btree (uploaded_at);


--
-- TOC entry 4996 (class 1259 OID 20098)
-- Name: idx_workspace_file_version_of; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_workspace_file_version_of ON public.workspace_files USING btree (version_of);


--
-- TOC entry 4997 (class 1259 OID 20099)
-- Name: idx_workspace_file_workspace; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_workspace_file_workspace ON public.workspace_files USING btree (workspace_id);


--
-- TOC entry 5001 (class 1259 OID 20100)
-- Name: idx_workspace_group_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_workspace_group_name ON public.workspace_groups USING btree (group_name);


--
-- TOC entry 5002 (class 1259 OID 20101)
-- Name: idx_workspace_group_permission; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_workspace_group_permission ON public.workspace_groups USING btree (permission_level);


--
-- TOC entry 5003 (class 1259 OID 20102)
-- Name: idx_workspace_group_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_workspace_group_unique ON public.workspace_groups USING btree (workspace_id, group_name);


--
-- TOC entry 5004 (class 1259 OID 20103)
-- Name: idx_workspace_group_workspace; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_workspace_group_workspace ON public.workspace_groups USING btree (workspace_id);


--
-- TOC entry 5008 (class 1259 OID 20104)
-- Name: idx_workspace_user_permission; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_workspace_user_permission ON public.workspace_users USING btree (permission_level);


--
-- TOC entry 5009 (class 1259 OID 20105)
-- Name: idx_workspace_user_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_workspace_user_unique ON public.workspace_users USING btree (workspace_id, user_id);


--
-- TOC entry 5010 (class 1259 OID 20106)
-- Name: idx_workspace_user_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_workspace_user_user ON public.workspace_users USING btree (user_id);


--
-- TOC entry 5011 (class 1259 OID 20107)
-- Name: idx_workspace_user_workspace; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_workspace_user_workspace ON public.workspace_users USING btree (workspace_id);


--
-- TOC entry 4945 (class 1259 OID 20108)
-- Name: ix_file_shares_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_file_shares_id ON public.file_shares USING btree (id);


--
-- TOC entry 5095 (class 1259 OID 21545)
-- Name: ix_mvp_module_group_access_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_mvp_module_group_access_id ON public.mvp_module_group_access USING btree (id);


--
-- TOC entry 4952 (class 1259 OID 20109)
-- Name: ix_mvp_module_logs_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_mvp_module_logs_id ON public.mvp_module_logs USING btree (id);


--
-- TOC entry 5088 (class 1259 OID 21524)
-- Name: ix_mvp_module_user_access_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_mvp_module_user_access_id ON public.mvp_module_user_access USING btree (id);


--
-- TOC entry 4960 (class 1259 OID 20110)
-- Name: ix_mvp_modules_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_mvp_modules_id ON public.mvp_modules USING btree (id);


--
-- TOC entry 5102 (class 1259 OID 21739)
-- Name: ix_user_sessions_jwt_token_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_user_sessions_jwt_token_id ON public.user_sessions USING btree (jwt_token_id);


--
-- TOC entry 5103 (class 1259 OID 21735)
-- Name: ix_user_sessions_session_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_user_sessions_session_id ON public.user_sessions USING btree (session_id);


--
-- TOC entry 5104 (class 1259 OID 21736)
-- Name: ix_user_sessions_user_email; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_user_sessions_user_email ON public.user_sessions USING btree (user_email);


--
-- TOC entry 5105 (class 1259 OID 21733)
-- Name: ix_user_sessions_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_user_sessions_user_id ON public.user_sessions USING btree (user_id);


--
-- TOC entry 4998 (class 1259 OID 20111)
-- Name: ix_workspace_files_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_workspace_files_id ON public.workspace_files USING btree (id);


--
-- TOC entry 5005 (class 1259 OID 20112)
-- Name: ix_workspace_groups_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_workspace_groups_id ON public.workspace_groups USING btree (id);


--
-- TOC entry 5012 (class 1259 OID 20113)
-- Name: ix_workspace_users_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_workspace_users_id ON public.workspace_users USING btree (id);


--
-- TOC entry 5018 (class 1259 OID 20114)
-- Name: ix_workspaces_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_workspaces_id ON public.workspaces USING btree (id);


--
-- TOC entry 5019 (class 1259 OID 20115)
-- Name: ix_workspaces_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_workspaces_name ON public.workspaces USING btree (name);


--
-- TOC entry 5020 (class 1259 OID 20116)
-- Name: ix_workspaces_slug; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX ix_workspaces_slug ON public.workspaces USING btree (slug);


--
-- TOC entry 5133 (class 2620 OID 21623)
-- Name: personal_test_process_flows trigger_sync_flow_scope; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_sync_flow_scope AFTER UPDATE ON public.personal_test_process_flows FOR EACH ROW EXECUTE FUNCTION public.sync_flow_scope();


--
-- TOC entry 5108 (class 2606 OID 20117)
-- Name: api_endpoint_mappings api_endpoint_mappings_config_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.api_endpoint_mappings
    ADD CONSTRAINT api_endpoint_mappings_config_id_fkey FOREIGN KEY (config_id) REFERENCES public.data_source_configs(id) ON DELETE CASCADE;


--
-- TOC entry 5109 (class 2606 OID 20122)
-- Name: file_shares file_shares_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.file_shares
    ADD CONSTRAINT file_shares_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.workspace_files(id) ON DELETE CASCADE;


--
-- TOC entry 5132 (class 2606 OID 21536)
-- Name: mvp_module_group_access mvp_module_group_access_module_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.mvp_module_group_access
    ADD CONSTRAINT mvp_module_group_access_module_id_fkey FOREIGN KEY (module_id) REFERENCES public.mvp_modules(id) ON DELETE CASCADE;


--
-- TOC entry 5110 (class 2606 OID 20127)
-- Name: mvp_module_logs mvp_module_logs_module_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.mvp_module_logs
    ADD CONSTRAINT mvp_module_logs_module_id_fkey FOREIGN KEY (module_id) REFERENCES public.mvp_modules(id) ON DELETE CASCADE;


--
-- TOC entry 5131 (class 2606 OID 21517)
-- Name: mvp_module_user_access mvp_module_user_access_module_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.mvp_module_user_access
    ADD CONSTRAINT mvp_module_user_access_module_id_fkey FOREIGN KEY (module_id) REFERENCES public.mvp_modules(id) ON DELETE CASCADE;


--
-- TOC entry 5111 (class 2606 OID 20132)
-- Name: mvp_modules mvp_modules_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.mvp_modules
    ADD CONSTRAINT mvp_modules_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- TOC entry 5112 (class 2606 OID 20137)
-- Name: personal_test_measurement_data personal_test_measurement_data_equipment_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.personal_test_measurement_data
    ADD CONSTRAINT personal_test_measurement_data_equipment_code_fkey FOREIGN KEY (equipment_code) REFERENCES public.personal_test_equipment_status(equipment_code);


--
-- TOC entry 5113 (class 2606 OID 20142)
-- Name: personal_test_process_flow_versions personal_test_process_flow_versions_flow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.personal_test_process_flow_versions
    ADD CONSTRAINT personal_test_process_flow_versions_flow_id_fkey FOREIGN KEY (flow_id) REFERENCES public.personal_test_process_flows(id) ON DELETE CASCADE;


--
-- TOC entry 5120 (class 2606 OID 21368)
-- Name: total_monitoring_database_connections total_monitoring_database_connections_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.total_monitoring_database_connections
    ADD CONSTRAINT total_monitoring_database_connections_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- TOC entry 5123 (class 2606 OID 21414)
-- Name: total_monitoring_equipment_nodes total_monitoring_equipment_nodes_flow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.total_monitoring_equipment_nodes
    ADD CONSTRAINT total_monitoring_equipment_nodes_flow_id_fkey FOREIGN KEY (flow_id) REFERENCES public.total_monitoring_process_flows(id) ON DELETE CASCADE;


--
-- TOC entry 5124 (class 2606 OID 21409)
-- Name: total_monitoring_equipment_nodes total_monitoring_equipment_nodes_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.total_monitoring_equipment_nodes
    ADD CONSTRAINT total_monitoring_equipment_nodes_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- TOC entry 5125 (class 2606 OID 21436)
-- Name: total_monitoring_instrument_nodes total_monitoring_instrument_nodes_flow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.total_monitoring_instrument_nodes
    ADD CONSTRAINT total_monitoring_instrument_nodes_flow_id_fkey FOREIGN KEY (flow_id) REFERENCES public.total_monitoring_process_flows(id) ON DELETE CASCADE;


--
-- TOC entry 5126 (class 2606 OID 21431)
-- Name: total_monitoring_instrument_nodes total_monitoring_instrument_nodes_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.total_monitoring_instrument_nodes
    ADD CONSTRAINT total_monitoring_instrument_nodes_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- TOC entry 5121 (class 2606 OID 21390)
-- Name: total_monitoring_process_flows total_monitoring_process_flows_database_connection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.total_monitoring_process_flows
    ADD CONSTRAINT total_monitoring_process_flows_database_connection_id_fkey FOREIGN KEY (database_connection_id) REFERENCES public.total_monitoring_database_connections(id);


--
-- TOC entry 5122 (class 2606 OID 21385)
-- Name: total_monitoring_process_flows total_monitoring_process_flows_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.total_monitoring_process_flows
    ADD CONSTRAINT total_monitoring_process_flows_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- TOC entry 5127 (class 2606 OID 21460)
-- Name: total_monitoring_published_flows total_monitoring_published_flows_flow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.total_monitoring_published_flows
    ADD CONSTRAINT total_monitoring_published_flows_flow_id_fkey FOREIGN KEY (flow_id) REFERENCES public.total_monitoring_process_flows(id) ON DELETE CASCADE;


--
-- TOC entry 5128 (class 2606 OID 21455)
-- Name: total_monitoring_published_flows total_monitoring_published_flows_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.total_monitoring_published_flows
    ADD CONSTRAINT total_monitoring_published_flows_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- TOC entry 5129 (class 2606 OID 21478)
-- Name: total_monitoring_query_templates total_monitoring_query_templates_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.total_monitoring_query_templates
    ADD CONSTRAINT total_monitoring_query_templates_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- TOC entry 5130 (class 2606 OID 21495)
-- Name: total_monitoring_workspace_features total_monitoring_workspace_features_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.total_monitoring_workspace_features
    ADD CONSTRAINT total_monitoring_workspace_features_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- TOC entry 5114 (class 2606 OID 20147)
-- Name: workspace_files workspace_files_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workspace_files
    ADD CONSTRAINT workspace_files_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.workspace_files(id) ON DELETE CASCADE;


--
-- TOC entry 5115 (class 2606 OID 20152)
-- Name: workspace_files workspace_files_version_of_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workspace_files
    ADD CONSTRAINT workspace_files_version_of_fkey FOREIGN KEY (version_of) REFERENCES public.workspace_files(id);


--
-- TOC entry 5116 (class 2606 OID 20157)
-- Name: workspace_files workspace_files_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workspace_files
    ADD CONSTRAINT workspace_files_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- TOC entry 5117 (class 2606 OID 20162)
-- Name: workspace_groups workspace_groups_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workspace_groups
    ADD CONSTRAINT workspace_groups_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- TOC entry 5118 (class 2606 OID 20167)
-- Name: workspace_users workspace_users_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workspace_users
    ADD CONSTRAINT workspace_users_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- TOC entry 5119 (class 2606 OID 20172)
-- Name: workspaces workspaces_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workspaces
    ADD CONSTRAINT workspaces_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


-- Completed on 2025-08-04 13:45:22

--
-- PostgreSQL database dump complete
--

