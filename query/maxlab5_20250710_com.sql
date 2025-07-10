--
-- PostgreSQL database dump
--

-- Dumped from database version 17.5
-- Dumped by pg_dump version 17.5

-- Started on 2025-07-10 10:01:01

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
-- TOC entry 5135 (class 0 OID 0)
-- Dependencies: 4
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: pg_database_owner
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- TOC entry 869 (class 1247 OID 19845)
-- Name: ownertype; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.ownertype AS ENUM (
    'USER',
    'GROUP'
);


ALTER TYPE public.ownertype OWNER TO postgres;

--
-- TOC entry 872 (class 1247 OID 19850)
-- Name: workspacetype; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.workspacetype AS ENUM (
    'PERSONAL',
    'GROUP'
);


ALTER TYPE public.workspacetype OWNER TO postgres;

--
-- TOC entry 239 (class 1255 OID 19855)
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
-- TOC entry 240 (class 1255 OID 19856)
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

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 217 (class 1259 OID 19857)
-- Name: alembic_version; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.alembic_version (
    version_num character varying(32) NOT NULL
);


ALTER TABLE public.alembic_version OWNER TO postgres;

--
-- TOC entry 218 (class 1259 OID 19860)
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
-- TOC entry 219 (class 1259 OID 19868)
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
-- TOC entry 5136 (class 0 OID 0)
-- Dependencies: 219
-- Name: COLUMN data_source_configs.custom_queries; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.data_source_configs.custom_queries IS 'Custom SQL queries for each data type. Structure: {"equipment_status": {"query": "SELECT ...", "description": "..."}, ...}';


--
-- TOC entry 220 (class 1259 OID 19881)
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
-- TOC entry 221 (class 1259 OID 19891)
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
-- TOC entry 222 (class 1259 OID 19901)
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
-- TOC entry 223 (class 1259 OID 19910)
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
-- TOC entry 5137 (class 0 OID 0)
-- Dependencies: 223
-- Name: COLUMN file_shares.share_token; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.file_shares.share_token IS '공유 토큰';


--
-- TOC entry 5138 (class 0 OID 0)
-- Dependencies: 223
-- Name: COLUMN file_shares.share_type; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.file_shares.share_type IS '공유 타입 (view/download)';


--
-- TOC entry 5139 (class 0 OID 0)
-- Dependencies: 223
-- Name: COLUMN file_shares.password; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.file_shares.password IS '비밀번호 (해시)';


--
-- TOC entry 5140 (class 0 OID 0)
-- Dependencies: 223
-- Name: COLUMN file_shares.expires_at; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.file_shares.expires_at IS '만료일시';


--
-- TOC entry 5141 (class 0 OID 0)
-- Dependencies: 223
-- Name: COLUMN file_shares.max_downloads; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.file_shares.max_downloads IS '최대 다운로드 횟수';


--
-- TOC entry 5142 (class 0 OID 0)
-- Dependencies: 223
-- Name: COLUMN file_shares.download_count; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.file_shares.download_count IS '다운로드 횟수';


--
-- TOC entry 5143 (class 0 OID 0)
-- Dependencies: 223
-- Name: COLUMN file_shares.created_by; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.file_shares.created_by IS '생성자';


--
-- TOC entry 5144 (class 0 OID 0)
-- Dependencies: 223
-- Name: COLUMN file_shares.created_at; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.file_shares.created_at IS '생성일시';


--
-- TOC entry 5145 (class 0 OID 0)
-- Dependencies: 223
-- Name: COLUMN file_shares.last_accessed_at; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.file_shares.last_accessed_at IS '마지막 접근일시';


--
-- TOC entry 224 (class 1259 OID 19916)
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
-- TOC entry 225 (class 1259 OID 19921)
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
-- TOC entry 5146 (class 0 OID 0)
-- Dependencies: 225
-- Name: COLUMN mvp_module_logs.action; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.mvp_module_logs.action IS '액션 타입 (install/uninstall/activate/deactivate/configure)';


--
-- TOC entry 5147 (class 0 OID 0)
-- Dependencies: 225
-- Name: COLUMN mvp_module_logs.message; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.mvp_module_logs.message IS '로그 메시지';


--
-- TOC entry 5148 (class 0 OID 0)
-- Dependencies: 225
-- Name: COLUMN mvp_module_logs.details; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.mvp_module_logs.details IS '상세 정보 JSON';


--
-- TOC entry 5149 (class 0 OID 0)
-- Dependencies: 225
-- Name: COLUMN mvp_module_logs.created_by; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.mvp_module_logs.created_by IS '액션 수행자';


--
-- TOC entry 5150 (class 0 OID 0)
-- Dependencies: 225
-- Name: COLUMN mvp_module_logs.created_at; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.mvp_module_logs.created_at IS '생성일시';


--
-- TOC entry 226 (class 1259 OID 19927)
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
-- TOC entry 5151 (class 0 OID 0)
-- Dependencies: 226
-- Name: COLUMN mvp_modules.module_name; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.mvp_modules.module_name IS '모듈명 (파이썬 모듈명)';


--
-- TOC entry 5152 (class 0 OID 0)
-- Dependencies: 226
-- Name: COLUMN mvp_modules.display_name; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.mvp_modules.display_name IS '표시명';


--
-- TOC entry 5153 (class 0 OID 0)
-- Dependencies: 226
-- Name: COLUMN mvp_modules.description; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.mvp_modules.description IS '모듈 설명';


--
-- TOC entry 5154 (class 0 OID 0)
-- Dependencies: 226
-- Name: COLUMN mvp_modules.version; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.mvp_modules.version IS '모듈 버전';


--
-- TOC entry 5155 (class 0 OID 0)
-- Dependencies: 226
-- Name: COLUMN mvp_modules.is_active; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.mvp_modules.is_active IS '활성화 상태';


--
-- TOC entry 5156 (class 0 OID 0)
-- Dependencies: 226
-- Name: COLUMN mvp_modules.is_installed; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.mvp_modules.is_installed IS '설치 상태';


--
-- TOC entry 5157 (class 0 OID 0)
-- Dependencies: 226
-- Name: COLUMN mvp_modules.config; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.mvp_modules.config IS '모듈 설정 JSON';


--
-- TOC entry 5158 (class 0 OID 0)
-- Dependencies: 226
-- Name: COLUMN mvp_modules.sort_order; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.mvp_modules.sort_order IS '정렬 순서';


--
-- TOC entry 5159 (class 0 OID 0)
-- Dependencies: 226
-- Name: COLUMN mvp_modules.icon; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.mvp_modules.icon IS '아이콘';


--
-- TOC entry 5160 (class 0 OID 0)
-- Dependencies: 226
-- Name: COLUMN mvp_modules.color; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.mvp_modules.color IS '테마 색상';


--
-- TOC entry 5161 (class 0 OID 0)
-- Dependencies: 226
-- Name: COLUMN mvp_modules.created_by; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.mvp_modules.created_by IS '생성자';


--
-- TOC entry 5162 (class 0 OID 0)
-- Dependencies: 226
-- Name: COLUMN mvp_modules.updated_by; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.mvp_modules.updated_by IS '최종 수정자';


--
-- TOC entry 5163 (class 0 OID 0)
-- Dependencies: 226
-- Name: COLUMN mvp_modules.created_at; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.mvp_modules.created_at IS '생성일시';


--
-- TOC entry 5164 (class 0 OID 0)
-- Dependencies: 226
-- Name: COLUMN mvp_modules.updated_at; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.mvp_modules.updated_at IS '수정일시';


--
-- TOC entry 227 (class 1259 OID 19936)
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
-- TOC entry 228 (class 1259 OID 19940)
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
-- TOC entry 229 (class 1259 OID 19945)
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
-- TOC entry 5165 (class 0 OID 0)
-- Dependencies: 229
-- Name: personal_test_measurement_data_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.personal_test_measurement_data_id_seq OWNED BY public.personal_test_measurement_data.id;


--
-- TOC entry 230 (class 1259 OID 19946)
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
    data_source_id character varying(255)
);


ALTER TABLE public.personal_test_process_flow_versions OWNER TO postgres;

--
-- TOC entry 231 (class 1259 OID 19954)
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
    data_source_id character varying(255)
);


ALTER TABLE public.personal_test_process_flows OWNER TO postgres;

--
-- TOC entry 232 (class 1259 OID 19964)
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
-- TOC entry 238 (class 1259 OID 20182)
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
-- TOC entry 233 (class 1259 OID 19969)
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
-- TOC entry 234 (class 1259 OID 19974)
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
-- TOC entry 5166 (class 0 OID 0)
-- Dependencies: 234
-- Name: COLUMN workspace_files.name; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_files.name IS '파일명';


--
-- TOC entry 5167 (class 0 OID 0)
-- Dependencies: 234
-- Name: COLUMN workspace_files.original_name; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_files.original_name IS '원본 파일명';


--
-- TOC entry 5168 (class 0 OID 0)
-- Dependencies: 234
-- Name: COLUMN workspace_files.file_path; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_files.file_path IS '저장 경로';


--
-- TOC entry 5169 (class 0 OID 0)
-- Dependencies: 234
-- Name: COLUMN workspace_files.file_size; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_files.file_size IS '파일 크기 (bytes)';


--
-- TOC entry 5170 (class 0 OID 0)
-- Dependencies: 234
-- Name: COLUMN workspace_files.mime_type; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_files.mime_type IS 'MIME 타입';


--
-- TOC entry 5171 (class 0 OID 0)
-- Dependencies: 234
-- Name: COLUMN workspace_files.file_hash; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_files.file_hash IS '파일 해시 (SHA256)';


--
-- TOC entry 5172 (class 0 OID 0)
-- Dependencies: 234
-- Name: COLUMN workspace_files.is_directory; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_files.is_directory IS '디렉토리 여부';


--
-- TOC entry 5173 (class 0 OID 0)
-- Dependencies: 234
-- Name: COLUMN workspace_files.file_extension; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_files.file_extension IS '파일 확장자';


--
-- TOC entry 5174 (class 0 OID 0)
-- Dependencies: 234
-- Name: COLUMN workspace_files.file_metadata; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_files.file_metadata IS '파일 메타데이터';


--
-- TOC entry 5175 (class 0 OID 0)
-- Dependencies: 234
-- Name: COLUMN workspace_files.description; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_files.description IS '파일 설명';


--
-- TOC entry 5176 (class 0 OID 0)
-- Dependencies: 234
-- Name: COLUMN workspace_files.is_deleted; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_files.is_deleted IS '삭제 상태';


--
-- TOC entry 5177 (class 0 OID 0)
-- Dependencies: 234
-- Name: COLUMN workspace_files.is_public; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_files.is_public IS '공개 여부';


--
-- TOC entry 5178 (class 0 OID 0)
-- Dependencies: 234
-- Name: COLUMN workspace_files.version; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_files.version IS '파일 버전';


--
-- TOC entry 5179 (class 0 OID 0)
-- Dependencies: 234
-- Name: COLUMN workspace_files.version_of; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_files.version_of IS '원본 파일 ID';


--
-- TOC entry 5180 (class 0 OID 0)
-- Dependencies: 234
-- Name: COLUMN workspace_files.uploaded_by; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_files.uploaded_by IS '업로드 사용자';


--
-- TOC entry 5181 (class 0 OID 0)
-- Dependencies: 234
-- Name: COLUMN workspace_files.uploaded_at; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_files.uploaded_at IS '업로드 일시';


--
-- TOC entry 5182 (class 0 OID 0)
-- Dependencies: 234
-- Name: COLUMN workspace_files.modified_by; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_files.modified_by IS '최종 수정자';


--
-- TOC entry 5183 (class 0 OID 0)
-- Dependencies: 234
-- Name: COLUMN workspace_files.modified_at; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_files.modified_at IS '수정일시';


--
-- TOC entry 235 (class 1259 OID 19980)
-- Name: workspace_groups; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.workspace_groups (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    group_name character varying(255) NOT NULL,
    group_display_name character varying(255),
    permission_level character varying(50) NOT NULL,
    created_by character varying(255) NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.workspace_groups OWNER TO postgres;

--
-- TOC entry 5184 (class 0 OID 0)
-- Dependencies: 235
-- Name: COLUMN workspace_groups.group_name; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_groups.group_name IS '그룹명';


--
-- TOC entry 5185 (class 0 OID 0)
-- Dependencies: 235
-- Name: COLUMN workspace_groups.group_display_name; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_groups.group_display_name IS '그룹 표시명';


--
-- TOC entry 5186 (class 0 OID 0)
-- Dependencies: 235
-- Name: COLUMN workspace_groups.permission_level; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_groups.permission_level IS '권한 레벨 (read/write/admin)';


--
-- TOC entry 5187 (class 0 OID 0)
-- Dependencies: 235
-- Name: COLUMN workspace_groups.created_by; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_groups.created_by IS '생성자';


--
-- TOC entry 5188 (class 0 OID 0)
-- Dependencies: 235
-- Name: COLUMN workspace_groups.created_at; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_groups.created_at IS '생성일시';


--
-- TOC entry 236 (class 1259 OID 19986)
-- Name: workspace_users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.workspace_users (
    id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    user_id character varying(255) NOT NULL,
    user_display_name character varying(255),
    permission_level character varying(50) NOT NULL,
    created_by character varying(255) NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.workspace_users OWNER TO postgres;

--
-- TOC entry 5189 (class 0 OID 0)
-- Dependencies: 236
-- Name: COLUMN workspace_users.user_id; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_users.user_id IS '사용자 ID';


--
-- TOC entry 5190 (class 0 OID 0)
-- Dependencies: 236
-- Name: COLUMN workspace_users.user_display_name; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_users.user_display_name IS '사용자 표시명';


--
-- TOC entry 5191 (class 0 OID 0)
-- Dependencies: 236
-- Name: COLUMN workspace_users.permission_level; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_users.permission_level IS '권한 레벨 (read/write/admin)';


--
-- TOC entry 5192 (class 0 OID 0)
-- Dependencies: 236
-- Name: COLUMN workspace_users.created_by; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_users.created_by IS '생성자';


--
-- TOC entry 5193 (class 0 OID 0)
-- Dependencies: 236
-- Name: COLUMN workspace_users.created_at; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_users.created_at IS '생성일시';


--
-- TOC entry 237 (class 1259 OID 19992)
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
-- TOC entry 5194 (class 0 OID 0)
-- Dependencies: 237
-- Name: COLUMN workspaces.name; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspaces.name IS '워크스페이스 이름';


--
-- TOC entry 5195 (class 0 OID 0)
-- Dependencies: 237
-- Name: COLUMN workspaces.slug; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspaces.slug IS 'URL 친화적 이름';


--
-- TOC entry 5196 (class 0 OID 0)
-- Dependencies: 237
-- Name: COLUMN workspaces.description; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspaces.description IS '워크스페이스 설명';


--
-- TOC entry 5197 (class 0 OID 0)
-- Dependencies: 237
-- Name: COLUMN workspaces.is_active; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspaces.is_active IS '활성화 상태';


--
-- TOC entry 5198 (class 0 OID 0)
-- Dependencies: 237
-- Name: COLUMN workspaces.settings; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspaces.settings IS '워크스페이스 설정 JSON';


--
-- TOC entry 5199 (class 0 OID 0)
-- Dependencies: 237
-- Name: COLUMN workspaces.created_by; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspaces.created_by IS '생성자';


--
-- TOC entry 5200 (class 0 OID 0)
-- Dependencies: 237
-- Name: COLUMN workspaces.updated_by; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspaces.updated_by IS '최종 수정자';


--
-- TOC entry 5201 (class 0 OID 0)
-- Dependencies: 237
-- Name: COLUMN workspaces.created_at; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspaces.created_at IS '생성일시';


--
-- TOC entry 5202 (class 0 OID 0)
-- Dependencies: 237
-- Name: COLUMN workspaces.updated_at; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspaces.updated_at IS '수정일시';


--
-- TOC entry 4814 (class 2604 OID 20002)
-- Name: personal_test_measurement_data id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.personal_test_measurement_data ALTER COLUMN id SET DEFAULT nextval('public.personal_test_measurement_data_id_seq'::regclass);


--
-- TOC entry 5110 (class 0 OID 19857)
-- Dependencies: 217
-- Data for Name: alembic_version; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.alembic_version (version_num) VALUES ('b42177cf0425');


--
-- TOC entry 5111 (class 0 OID 19860)
-- Dependencies: 218
-- Data for Name: api_endpoint_mappings; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- TOC entry 5112 (class 0 OID 19868)
-- Dependencies: 219
-- Data for Name: data_source_configs; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.data_source_configs (id, workspace_id, config_name, source_type, api_url, api_key, api_headers, mssql_connection_string, is_active, cache_ttl, timeout_seconds, retry_count, created_by, created_at, updated_at, connection_string, custom_queries) VALUES ('2881a01f-1eed-4343-b0d1-5d8d22f6744a', '21ee03db-90c4-4592-b00f-c44801e0b164', 'mssql_config', 'MSSQL', NULL, NULL, NULL, 'DRIVER={FreeTDS};SERVER=172.28.32.1;DATABASE=AIDB;UID=mss;PWD=2300;TrustServerCertificate=yes;Connection Timeout=30;Command Timeout=60;TDS_Version=8.0;Port=1433', true, 300, 30, 3, NULL, '2025-07-08 11:58:08.280747+09', '2025-07-09 08:48:43.611596+09', NULL, '{"equipment_status": {"query": "select * from [dbo].[vw_equipment_status_mock]\n", "description": ""}, "measurement_data": {"query": "select *\nfrom vw_measurement_data_mock\n", "description": ""}}');


--
-- TOC entry 5113 (class 0 OID 19881)
-- Dependencies: 220
-- Data for Name: data_source_endpoint_mappings; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.data_source_endpoint_mappings (id, data_source_id, data_type, table_name, query_template, endpoint_path, http_method, request_headers, request_body_template, response_path, is_active, created_at, updated_at) VALUES ('4ace0782-2223-4895-a438-3c1ff5053fd6', '83c84ef5-c316-40bb-8cf6-8b574320b7e5', 'equipment_status', 'equipment_status', 'SELECT equipment_type, equipment_code, equipment_name, status, last_run_time FROM personal_test_equipment_status WHERE 1=1', NULL, 'GET', NULL, NULL, NULL, true, '2025-07-06 17:55:37.216054', '2025-07-06 17:55:37.216054');


--
-- TOC entry 5114 (class 0 OID 19891)
-- Dependencies: 221
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
-- TOC entry 5115 (class 0 OID 19901)
-- Dependencies: 222
-- Data for Name: data_source_mappings; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- TOC entry 5116 (class 0 OID 19910)
-- Dependencies: 223
-- Data for Name: file_shares; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- TOC entry 5117 (class 0 OID 19916)
-- Dependencies: 224
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
-- TOC entry 5118 (class 0 OID 19921)
-- Dependencies: 225
-- Data for Name: mvp_module_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- TOC entry 5119 (class 0 OID 19927)
-- Dependencies: 226
-- Data for Name: mvp_modules; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- TOC entry 5120 (class 0 OID 19936)
-- Dependencies: 227
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
-- TOC entry 5121 (class 0 OID 19940)
-- Dependencies: 228
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
-- TOC entry 5123 (class 0 OID 19946)
-- Dependencies: 230
-- Data for Name: personal_test_process_flow_versions; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.personal_test_process_flow_versions (id, flow_id, version_number, flow_data, name, description, created_by, created_at, is_published, published_at, publish_token, data_source_id) VALUES ('ddabe7a9-7fff-4b7b-a92b-b9665bd0b7e9', 'eed16ebd-efe5-4f5c-be40-5466ff4356a0', 1, '{"edges": [{"id": "reactflow__edge-_1751085089714-B1_1751085115749", "type": "smoothstep", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "_1751085089714", "target": "B1_1751085115749", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-_1751085089714-G1_1751085108606", "type": "straight", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "_1751085089714", "target": "G1_1751085108606", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-B1_1751085115749-E1_1751085118930", "type": "default", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "B1_1751085115749", "target": "E1_1751085118930", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-E1_1751085118930-E2_1751085155514", "type": "smoothstep", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "E1_1751085118930", "target": "E2_1751085155514", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-G1_1751085108606-E2_1751085155514", "type": "default", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "G1_1751085108606", "target": "E2_1751085155514", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}], "nodes": [{"id": "_1751085089714", "data": {"icon": "settings", "label": "감압기", "status": "STOP", "equipmentCode": "A101", "equipmentName": "감압기", "equipmentType": "A1", "displayMeasurements": ["TG-001", "TG-002"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": -90, "y": 80}, "selected": false, "positionAbsolute": {"x": -90, "y": 80}}, {"id": "G1_1751085108606", "data": {"icon": "flame", "label": "히터", "status": "STOP", "equipmentCode": "G101", "equipmentName": "히터", "equipmentType": "G1", "displayMeasurements": ["TH-101", "PW-101"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": -90, "y": 450}, "selected": false, "positionAbsolute": {"x": -90, "y": 450}}, {"id": "B1_1751085115749", "data": {"icon": "activity", "label": "차압기", "status": "STOP", "equipmentCode": "B101", "equipmentName": "차압기", "equipmentType": "B1", "displayMeasurements": ["TF-928"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 130, "y": 450}, "selected": false, "positionAbsolute": {"x": 130, "y": 450}}, {"id": "E1_1751085118930", "data": {"icon": "database", "label": "탱크", "status": "STOP", "equipmentCode": "E101", "equipmentName": "탱크", "equipmentType": "E1", "displayMeasurements": ["LV-101"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 350, "y": 800}, "selected": false, "positionAbsolute": {"x": 350, "y": 800}}, {"id": "E2_1751085155514", "data": {"icon": "archive", "label": "저장탱크", "status": "STOP", "equipmentCode": "E201", "equipmentName": "저장탱크", "equipmentType": "E2", "displayMeasurements": []}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 60, "y": 1110}, "selected": true, "positionAbsolute": {"x": 60, "y": 1110}}]}', '샘플공정도2 - Version 2025. 7. 3. 오후 9:44:50', 'Saved from editor at 2025. 7. 3. 오후 9:44:50', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-03 21:44:50.85315+09', false, NULL, NULL, NULL);
INSERT INTO public.personal_test_process_flow_versions (id, flow_id, version_number, flow_data, name, description, created_by, created_at, is_published, published_at, publish_token, data_source_id) VALUES ('6539cfd8-c74c-4f00-95a4-6741dce027bd', 'eed16ebd-efe5-4f5c-be40-5466ff4356a0', 2, '{"edges": [{"id": "reactflow__edge-_1751085089714-B1_1751085115749", "type": "smoothstep", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "_1751085089714", "target": "B1_1751085115749", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-_1751085089714-G1_1751085108606", "type": "straight", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "_1751085089714", "target": "G1_1751085108606", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-B1_1751085115749-E1_1751085118930", "type": "default", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "B1_1751085115749", "target": "E1_1751085118930", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-E1_1751085118930-E2_1751085155514", "type": "smoothstep", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "E1_1751085118930", "target": "E2_1751085155514", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-G1_1751085108606-E2_1751085155514", "type": "default", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "G1_1751085108606", "target": "E2_1751085155514", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}], "nodes": [{"id": "_1751085089714", "data": {"icon": "settings", "label": "감압기", "status": "STOP", "equipmentCode": "A101", "equipmentName": "감압기", "equipmentType": "A1", "displayMeasurements": ["TG-001", "TG-002"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": -90, "y": 80}, "selected": false, "positionAbsolute": {"x": -90, "y": 80}}, {"id": "G1_1751085108606", "data": {"icon": "flame", "label": "히터", "status": "STOP", "equipmentCode": "G101", "equipmentName": "히터", "equipmentType": "G1", "displayMeasurements": ["TH-101", "PW-101"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": -90, "y": 450}, "selected": false, "positionAbsolute": {"x": -90, "y": 450}}, {"id": "B1_1751085115749", "data": {"icon": "activity", "label": "차압기", "status": "STOP", "equipmentCode": "B101", "equipmentName": "차압기", "equipmentType": "B1", "displayMeasurements": ["TF-928"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 130, "y": 450}, "selected": false, "positionAbsolute": {"x": 130, "y": 450}}, {"id": "E1_1751085118930", "data": {"icon": "database", "label": "탱크", "status": "STOP", "equipmentCode": "E101", "equipmentName": "탱크", "equipmentType": "E1", "displayMeasurements": ["LV-101"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 350, "y": 800}, "selected": false, "positionAbsolute": {"x": 350, "y": 800}}, {"id": "E2_1751085155514", "data": {"icon": "archive", "label": "저장탱크", "status": "STOP", "equipmentCode": "E201", "equipmentName": "저장탱크", "equipmentType": "E2", "displayMeasurements": []}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 60, "y": 1110}, "selected": true, "positionAbsolute": {"x": 60, "y": 1110}}]}', '샘플공정도2 - Version 2025. 7. 3. 오후 9:45:17', 'Saved from editor at 2025. 7. 3. 오후 9:45:17', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-03 21:45:17.906466+09', false, NULL, NULL, NULL);
INSERT INTO public.personal_test_process_flow_versions (id, flow_id, version_number, flow_data, name, description, created_by, created_at, is_published, published_at, publish_token, data_source_id) VALUES ('4c3073f7-57df-4ed0-a669-06bf6a9909ce', '116675b3-43cb-4a93-986b-e6c133204d16', 1, '{"edges": [{"id": "reactflow__edge-A1_1751073324228-C2_1751073352895", "type": "step", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "A1_1751073324228", "target": "C2_1751073352895", "animated": false, "selected": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-B1_1751073343571-D2_1751077257073", "type": "step", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "B1_1751073343571", "target": "D2_1751077257073", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-D2_1751083266771-A1_1751083245170", "type": "default", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "D2_1751083266771", "target": "A1_1751083245170", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-B1_1751083289433-A1_1751083312881", "type": "smoothstep", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "B1_1751083289433", "target": "A1_1751083312881", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-D2_1751077257073-E2_1751083457125", "type": "step", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "D2_1751077257073", "target": "E2_1751083457125", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-E2_1751083457125-G1_1751083499986", "type": "straight", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "E2_1751083457125", "target": "G1_1751083499986", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-G1_1751083499986-D1_1751083531907", "type": "smoothstep", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "G1_1751083499986", "target": "D1_1751083531907", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-D1_1751083531907-E1_1751083480473", "type": "default", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "D1_1751083531907", "target": "E1_1751083480473", "animated": false, "selectable": true, "sourceHandle": null, "targetHandle": null}], "nodes": [{"id": "A1_1751073324228", "data": {"icon": "gauge", "label": "감압기", "status": "STOP", "equipmentCode": "A101", "equipmentName": "감압기", "equipmentType": "A1", "displayMeasurements": ["TG-001", "TG-002"]}, "type": "equipment", "style": {"width": 211, "height": 170}, "width": 211, "height": 170, "dragging": false, "position": {"x": 130, "y": 200}, "resizing": false, "selected": false, "positionAbsolute": {"x": 130, "y": 200}}, {"id": "B1_1751073343571", "data": {"icon": "activity", "label": "차압기", "status": "STOP", "equipmentCode": "B101", "equipmentName": "차압기", "equipmentType": "B1", "displayMeasurements": ["TF-928", "TF-929"]}, "type": "equipment", "style": {"width": 208, "height": 170}, "width": 208, "height": 170, "dragging": false, "position": {"x": 360, "y": 200}, "resizing": false, "selected": false, "positionAbsolute": {"x": 360, "y": 200}}, {"id": "C2_1751073352895", "data": {"icon": "thermometer", "label": "측정기", "status": "STOP", "equipmentCode": "C201", "equipmentName": "측정기", "equipmentType": "C2", "displayMeasurements": ["TS-201"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 135.5, "y": 525.6838827115021}, "selected": false, "positionAbsolute": {"x": 135.03774814099847, "y": 525.6838827115021}}, {"id": "D2_1751077257073", "data": {"icon": "zap", "label": "펌프", "status": "STOP", "equipmentCode": "D201", "equipmentName": "펌프", "equipmentType": "D2", "displayMeasurements": ["FL-201"]}, "type": "equipment", "style": {"width": 210, "height": 220}, "width": 210, "height": 220, "dragging": false, "position": {"x": 430, "y": 500}, "resizing": false, "selected": false, "positionAbsolute": {"x": 430, "y": 500}}, {"id": "group_1751077454819", "data": {"color": "#ff8080", "label": "Group"}, "type": "group", "style": {"width": 1276, "height": 808, "zIndex": -1}, "width": 1276, "height": 808, "dragging": false, "position": {"x": 40, "y": 120}, "resizing": false, "selected": false, "positionAbsolute": {"x": 40, "y": 120}}, {"id": "A1_1751083245170", "data": {"icon": "gauge", "label": "감압기", "status": "STOP", "equipmentCode": "A101", "equipmentName": "감압기", "equipmentType": "A1", "displayMeasurements": ["TG-001", "TG-002"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 660, "y": 530}, "selected": false, "positionAbsolute": {"x": 660, "y": 530}}, {"id": "D2_1751083266771", "data": {"icon": "zap", "label": "펌프", "status": "STOP", "equipmentCode": "D201", "equipmentName": "펌프", "equipmentType": "D2", "displayMeasurements": ["FL-201"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 720, "y": 200}, "selected": false, "positionAbsolute": {"x": 720, "y": 200}}, {"id": "B1_1751083289433", "data": {"icon": "activity", "label": "차압기", "status": "STOP", "equipmentCode": "B101", "equipmentName": "차압기", "equipmentType": "B1", "displayMeasurements": ["TF-928", "TF-929"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 930, "y": 200}, "selected": false, "positionAbsolute": {"x": 930, "y": 200}}, {"id": "A1_1751083312881", "data": {"icon": "gauge", "label": "감압기", "status": "STOP", "equipmentCode": "A101", "equipmentName": "감압기", "equipmentType": "A1", "displayMeasurements": ["TG-001", "TG-002"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 1000, "y": 550}, "selected": false, "positionAbsolute": {"x": 1000, "y": 550}}, {"id": "group_1751083444956", "data": {"color": "#3b82f6", "label": "Group"}, "type": "group", "style": {"width": 550, "height": 510, "zIndex": -1}, "width": 550, "height": 510, "dragging": false, "position": {"x": -1370, "y": 480}, "resizing": false, "selected": false, "positionAbsolute": {"x": -1370, "y": 480}}, {"id": "E2_1751083457125", "data": {"icon": "archive", "label": "저장탱크", "status": "STOP", "equipmentCode": "E201", "equipmentName": "저장탱크", "equipmentType": "E2", "displayMeasurements": []}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": -1250, "y": 580}, "selected": false, "positionAbsolute": {"x": -1250, "y": 580}}, {"id": "E1_1751083480473", "data": {"icon": "database", "label": "탱크", "status": "STOP", "equipmentCode": "E101", "equipmentName": "탱크", "equipmentType": "E1", "displayMeasurements": ["LV-101", "PR-101"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 720, "y": 1180}, "selected": false, "positionAbsolute": {"x": 720, "y": 1180}}, {"id": "group_1751083486315", "data": {"color": "#75f09a", "label": "Group"}, "type": "group", "style": {"width": 960, "height": 450, "zIndex": -1}, "width": 960, "height": 450, "dragging": false, "position": {"x": 50, "y": 1080}, "resizing": false, "selected": false, "positionAbsolute": {"x": 50, "y": 1080}}, {"id": "G1_1751083499986", "data": {"icon": "flame", "label": "히터", "status": "STOP", "equipmentCode": "G101", "equipmentName": "히터", "equipmentType": "G1", "displayMeasurements": ["TH-101", "PW-101"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 90, "y": 1170}, "selected": false, "positionAbsolute": {"x": 90, "y": 1170}}, {"id": "D1_1751083531907", "data": {"icon": "wind", "label": "압축기", "status": "STOP", "equipmentCode": "D101", "equipmentName": "압축기", "equipmentType": "D1", "displayMeasurements": ["PC-101", "TC-101"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 400, "y": 1170}, "selected": false, "positionAbsolute": {"x": 400, "y": 1170}}]}', '샘플 공정도 - Version 2025. 7. 3. 오후 9:45:33', 'Saved from editor at 2025. 7. 3. 오후 9:45:33', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-03 21:45:33.205275+09', false, NULL, NULL, NULL);
INSERT INTO public.personal_test_process_flow_versions (id, flow_id, version_number, flow_data, name, description, created_by, created_at, is_published, published_at, publish_token, data_source_id) VALUES ('14b928c1-90ca-49c1-af44-17011cec512b', '116675b3-43cb-4a93-986b-e6c133204d16', 2, '{"edges": [{"id": "reactflow__edge-A1_1751073324228-C2_1751073352895", "type": "step", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "A1_1751073324228", "target": "C2_1751073352895", "animated": false, "selected": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-B1_1751073343571-D2_1751077257073", "type": "step", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "B1_1751073343571", "target": "D2_1751077257073", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-D2_1751083266771-A1_1751083245170", "type": "default", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "D2_1751083266771", "target": "A1_1751083245170", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-B1_1751083289433-A1_1751083312881", "type": "smoothstep", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "B1_1751083289433", "target": "A1_1751083312881", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-D2_1751077257073-E2_1751083457125", "type": "step", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "D2_1751077257073", "target": "E2_1751083457125", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-E2_1751083457125-G1_1751083499986", "type": "straight", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "E2_1751083457125", "target": "G1_1751083499986", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-G1_1751083499986-D1_1751083531907", "type": "smoothstep", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "G1_1751083499986", "target": "D1_1751083531907", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-D1_1751083531907-E1_1751083480473", "type": "default", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "D1_1751083531907", "target": "E1_1751083480473", "animated": false, "selectable": true, "sourceHandle": null, "targetHandle": null}], "nodes": [{"id": "A1_1751073324228", "data": {"icon": "gauge", "label": "감압기", "status": "STOP", "equipmentCode": "A101", "equipmentName": "감압기", "equipmentType": "A1", "displayMeasurements": ["TG-001", "TG-002"]}, "type": "equipment", "style": {"width": 211, "height": 170}, "width": 211, "height": 170, "dragging": false, "position": {"x": 130, "y": 200}, "resizing": false, "selected": false, "positionAbsolute": {"x": 130, "y": 200}}, {"id": "B1_1751073343571", "data": {"icon": "activity", "label": "차압기", "status": "STOP", "equipmentCode": "B101", "equipmentName": "차압기", "equipmentType": "B1", "displayMeasurements": ["TF-928", "TF-929"]}, "type": "equipment", "style": {"width": 208, "height": 170}, "width": 208, "height": 170, "dragging": false, "position": {"x": 360, "y": 200}, "resizing": false, "selected": false, "positionAbsolute": {"x": 360, "y": 200}}, {"id": "C2_1751073352895", "data": {"icon": "thermometer", "label": "측정기", "status": "STOP", "equipmentCode": "C201", "equipmentName": "측정기", "equipmentType": "C2", "displayMeasurements": ["TS-201"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 135.5, "y": 525.6838827115021}, "selected": false, "positionAbsolute": {"x": 135.03774814099847, "y": 525.6838827115021}}, {"id": "D2_1751077257073", "data": {"icon": "zap", "label": "펌프", "status": "STOP", "equipmentCode": "D201", "equipmentName": "펌프", "equipmentType": "D2", "displayMeasurements": ["FL-201"]}, "type": "equipment", "style": {"width": 210, "height": 220}, "width": 210, "height": 220, "dragging": false, "position": {"x": 430, "y": 500}, "resizing": false, "selected": false, "positionAbsolute": {"x": 430, "y": 500}}, {"id": "group_1751077454819", "data": {"color": "#ff8080", "label": "Group"}, "type": "group", "style": {"width": 1276, "height": 808, "zIndex": -1}, "width": 1276, "height": 808, "dragging": false, "position": {"x": 40, "y": 120}, "resizing": false, "selected": false, "positionAbsolute": {"x": 40, "y": 120}}, {"id": "A1_1751083245170", "data": {"icon": "gauge", "label": "감압기", "status": "STOP", "equipmentCode": "A101", "equipmentName": "감압기", "equipmentType": "A1", "displayMeasurements": ["TG-001", "TG-002"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 660, "y": 530}, "selected": false, "positionAbsolute": {"x": 660, "y": 530}}, {"id": "D2_1751083266771", "data": {"icon": "zap", "label": "펌프", "status": "STOP", "equipmentCode": "D201", "equipmentName": "펌프", "equipmentType": "D2", "displayMeasurements": ["FL-201"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 720, "y": 200}, "selected": false, "positionAbsolute": {"x": 720, "y": 200}}, {"id": "B1_1751083289433", "data": {"icon": "activity", "label": "차압기", "status": "STOP", "equipmentCode": "B101", "equipmentName": "차압기", "equipmentType": "B1", "displayMeasurements": ["TF-928", "TF-929"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 930, "y": 200}, "selected": false, "positionAbsolute": {"x": 930, "y": 200}}, {"id": "A1_1751083312881", "data": {"icon": "gauge", "label": "감압기", "status": "STOP", "equipmentCode": "A101", "equipmentName": "감압기", "equipmentType": "A1", "displayMeasurements": ["TG-001", "TG-002"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 1000, "y": 550}, "selected": false, "positionAbsolute": {"x": 1000, "y": 550}}, {"id": "group_1751083444956", "data": {"color": "#3b82f6", "label": "Group"}, "type": "group", "style": {"width": 550, "height": 510, "zIndex": -1}, "width": 550, "height": 510, "dragging": false, "position": {"x": -1370, "y": 480}, "resizing": false, "selected": false, "positionAbsolute": {"x": -1370, "y": 480}}, {"id": "E2_1751083457125", "data": {"icon": "archive", "label": "저장탱크", "status": "STOP", "equipmentCode": "E201", "equipmentName": "저장탱크", "equipmentType": "E2", "displayMeasurements": []}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": -1250, "y": 580}, "selected": false, "positionAbsolute": {"x": -1250, "y": 580}}, {"id": "E1_1751083480473", "data": {"icon": "database", "label": "탱크", "status": "STOP", "equipmentCode": "E101", "equipmentName": "탱크", "equipmentType": "E1", "displayMeasurements": ["LV-101", "PR-101"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 720, "y": 1180}, "selected": false, "positionAbsolute": {"x": 720, "y": 1180}}, {"id": "group_1751083486315", "data": {"color": "#75f09a", "label": "Group"}, "type": "group", "style": {"width": 960, "height": 450, "zIndex": -1}, "width": 960, "height": 450, "dragging": false, "position": {"x": 50, "y": 1080}, "resizing": false, "selected": false, "positionAbsolute": {"x": 50, "y": 1080}}, {"id": "G1_1751083499986", "data": {"icon": "flame", "label": "히터", "status": "STOP", "equipmentCode": "G101", "equipmentName": "히터", "equipmentType": "G1", "displayMeasurements": ["TH-101", "PW-101"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 90, "y": 1170}, "selected": false, "positionAbsolute": {"x": 90, "y": 1170}}, {"id": "D1_1751083531907", "data": {"icon": "wind", "label": "압축기", "status": "STOP", "equipmentCode": "D101", "equipmentName": "압축기", "equipmentType": "D1", "displayMeasurements": ["PC-101", "TC-101"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 400, "y": 1170}, "selected": false, "positionAbsolute": {"x": 400, "y": 1170}}, {"id": "text_1751546743566", "data": {"text": "안녕하세요?", "color": "#000000", "padding": 8, "fontSize": 100, "textAlign": "center", "fontWeight": "normal", "borderColor": "#999999", "borderStyle": "none", "borderWidth": 1, "backgroundColor": "#ffffff"}, "type": "text", "width": 500, "height": 166, "dragging": false, "position": {"x": -675, "y": 45}, "selected": true, "positionAbsolute": {"x": -675, "y": 45}}]}', '샘플 공정도 - Version 2025. 7. 3. 오후 9:46:03', 'Saved from editor at 2025. 7. 3. 오후 9:46:03', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-03 21:46:03.105535+09', false, NULL, NULL, NULL);
INSERT INTO public.personal_test_process_flow_versions (id, flow_id, version_number, flow_data, name, description, created_by, created_at, is_published, published_at, publish_token, data_source_id) VALUES ('873d4603-e8ad-4fec-953d-4d675302862e', '116675b3-43cb-4a93-986b-e6c133204d16', 3, '{"edges": [{"id": "reactflow__edge-A1_1751073324228-C2_1751073352895", "type": "step", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "A1_1751073324228", "target": "C2_1751073352895", "animated": false, "selected": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-B1_1751073343571-D2_1751077257073", "type": "step", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "B1_1751073343571", "target": "D2_1751077257073", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-D2_1751083266771-A1_1751083245170", "type": "default", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "D2_1751083266771", "target": "A1_1751083245170", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-B1_1751083289433-A1_1751083312881", "type": "smoothstep", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "B1_1751083289433", "target": "A1_1751083312881", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-D2_1751077257073-E2_1751083457125", "type": "step", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "D2_1751077257073", "target": "E2_1751083457125", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-E2_1751083457125-G1_1751083499986", "type": "straight", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "E2_1751083457125", "target": "G1_1751083499986", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-G1_1751083499986-D1_1751083531907", "type": "smoothstep", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "G1_1751083499986", "target": "D1_1751083531907", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-D1_1751083531907-E1_1751083480473", "type": "default", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "D1_1751083531907", "target": "E1_1751083480473", "animated": false, "selectable": true, "sourceHandle": null, "targetHandle": null}], "nodes": [{"id": "A1_1751073324228", "data": {"icon": "gauge", "label": "감압기", "status": "STOP", "equipmentCode": "A101", "equipmentName": "감압기", "equipmentType": "A1", "displayMeasurements": ["TG-001", "TG-002"]}, "type": "equipment", "style": {"width": 211, "height": 170}, "width": 211, "height": 170, "dragging": false, "position": {"x": 130, "y": 200}, "resizing": false, "selected": false, "positionAbsolute": {"x": 130, "y": 200}}, {"id": "B1_1751073343571", "data": {"icon": "activity", "label": "차압기", "status": "STOP", "equipmentCode": "B101", "equipmentName": "차압기", "equipmentType": "B1", "displayMeasurements": ["TF-928", "TF-929"]}, "type": "equipment", "style": {"width": 208, "height": 170}, "width": 208, "height": 170, "dragging": false, "position": {"x": 360, "y": 200}, "resizing": false, "selected": false, "positionAbsolute": {"x": 360, "y": 200}}, {"id": "C2_1751073352895", "data": {"icon": "thermometer", "label": "측정기", "status": "STOP", "equipmentCode": "C201", "equipmentName": "측정기", "equipmentType": "C2", "displayMeasurements": ["TS-201"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 135.5, "y": 525.6838827115021}, "selected": false, "positionAbsolute": {"x": 135.03774814099847, "y": 525.6838827115021}}, {"id": "D2_1751077257073", "data": {"icon": "zap", "label": "펌프", "status": "STOP", "equipmentCode": "D201", "equipmentName": "펌프", "equipmentType": "D2", "displayMeasurements": ["FL-201"]}, "type": "equipment", "style": {"width": 210, "height": 220}, "width": 210, "height": 220, "dragging": false, "position": {"x": 430, "y": 500}, "resizing": false, "selected": false, "positionAbsolute": {"x": 430, "y": 500}}, {"id": "group_1751077454819", "data": {"color": "#ff8080", "label": "Group"}, "type": "group", "style": {"width": 1276, "height": 808, "zIndex": -1}, "width": 1276, "height": 808, "dragging": false, "position": {"x": 40, "y": 120}, "resizing": false, "selected": false, "positionAbsolute": {"x": 40, "y": 120}}, {"id": "A1_1751083245170", "data": {"icon": "gauge", "label": "감압기", "status": "STOP", "equipmentCode": "A101", "equipmentName": "감압기", "equipmentType": "A1", "displayMeasurements": ["TG-001", "TG-002"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 660, "y": 530}, "selected": false, "positionAbsolute": {"x": 660, "y": 530}}, {"id": "D2_1751083266771", "data": {"icon": "zap", "label": "펌프", "status": "STOP", "equipmentCode": "D201", "equipmentName": "펌프", "equipmentType": "D2", "displayMeasurements": ["FL-201"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 720, "y": 200}, "selected": false, "positionAbsolute": {"x": 720, "y": 200}}, {"id": "B1_1751083289433", "data": {"icon": "activity", "label": "차압기", "status": "STOP", "equipmentCode": "B101", "equipmentName": "차압기", "equipmentType": "B1", "displayMeasurements": ["TF-928", "TF-929"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 930, "y": 200}, "selected": false, "positionAbsolute": {"x": 930, "y": 200}}, {"id": "A1_1751083312881", "data": {"icon": "gauge", "label": "감압기", "status": "STOP", "equipmentCode": "A101", "equipmentName": "감압기", "equipmentType": "A1", "displayMeasurements": ["TG-001", "TG-002"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 1000, "y": 550}, "selected": false, "positionAbsolute": {"x": 1000, "y": 550}}, {"id": "group_1751083444956", "data": {"color": "#3b82f6", "label": "Group"}, "type": "group", "style": {"width": 550, "height": 510, "zIndex": -1}, "width": 550, "height": 510, "dragging": false, "position": {"x": -1370, "y": 480}, "resizing": false, "selected": false, "positionAbsolute": {"x": -1370, "y": 480}}, {"id": "E2_1751083457125", "data": {"icon": "archive", "label": "저장탱크", "status": "STOP", "equipmentCode": "E201", "equipmentName": "저장탱크", "equipmentType": "E2", "displayMeasurements": []}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": -1250, "y": 580}, "selected": false, "positionAbsolute": {"x": -1250, "y": 580}}, {"id": "E1_1751083480473", "data": {"icon": "database", "label": "탱크", "status": "STOP", "equipmentCode": "E101", "equipmentName": "탱크", "equipmentType": "E1", "displayMeasurements": ["LV-101", "PR-101"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 720, "y": 1180}, "selected": false, "positionAbsolute": {"x": 720, "y": 1180}}, {"id": "group_1751083486315", "data": {"color": "#75f09a", "label": "Group"}, "type": "group", "style": {"width": 960, "height": 450, "zIndex": -1}, "width": 960, "height": 450, "dragging": false, "position": {"x": 50, "y": 1080}, "resizing": false, "selected": false, "positionAbsolute": {"x": 50, "y": 1080}}, {"id": "G1_1751083499986", "data": {"icon": "flame", "label": "히터", "status": "STOP", "equipmentCode": "G101", "equipmentName": "히터", "equipmentType": "G1", "displayMeasurements": ["TH-101", "PW-101"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 90, "y": 1170}, "selected": false, "positionAbsolute": {"x": 90, "y": 1170}}, {"id": "D1_1751083531907", "data": {"icon": "wind", "label": "압축기", "status": "STOP", "equipmentCode": "D101", "equipmentName": "압축기", "equipmentType": "D1", "displayMeasurements": ["PC-101", "TC-101"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 400, "y": 1170}, "selected": false, "positionAbsolute": {"x": 400, "y": 1170}}, {"id": "group_1751546832939", "data": {"color": "#6b7280", "label": "Group", "zIndex": 0, "titleSize": 14, "titleColor": "#374151", "borderStyle": "dashed", "titlePosition": "top", "backgroundColor": "#6b7280", "backgroundOpacity": 10}, "type": "group", "style": {"width": 300, "height": 200}, "width": 300, "height": 200, "position": {"x": -810, "y": 195}}]}', '샘플 공정도 - Version 2025. 7. 3. 오후 9:47:14', 'Saved from editor at 2025. 7. 3. 오후 9:47:14', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-03 21:47:14.410524+09', false, NULL, NULL, NULL);
INSERT INTO public.personal_test_process_flow_versions (id, flow_id, version_number, flow_data, name, description, created_by, created_at, is_published, published_at, publish_token, data_source_id) VALUES ('510081ab-6bd9-48e5-b238-f3ca24453e21', '116675b3-43cb-4a93-986b-e6c133204d16', 4, '{"edges": [{"id": "reactflow__edge-A1_1751073324228-C2_1751073352895", "type": "step", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "A1_1751073324228", "target": "C2_1751073352895", "animated": false, "selected": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-B1_1751073343571-D2_1751077257073", "type": "step", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "B1_1751073343571", "target": "D2_1751077257073", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-D2_1751083266771-A1_1751083245170", "type": "default", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "D2_1751083266771", "target": "A1_1751083245170", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-B1_1751083289433-A1_1751083312881", "type": "smoothstep", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "B1_1751083289433", "target": "A1_1751083312881", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-D2_1751077257073-E2_1751083457125", "type": "step", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "D2_1751077257073", "target": "E2_1751083457125", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-E2_1751083457125-G1_1751083499986", "type": "straight", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "E2_1751083457125", "target": "G1_1751083499986", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-G1_1751083499986-D1_1751083531907", "type": "smoothstep", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "G1_1751083499986", "target": "D1_1751083531907", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-D1_1751083531907-E1_1751083480473", "type": "default", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "D1_1751083531907", "target": "E1_1751083480473", "animated": false, "selectable": true, "sourceHandle": null, "targetHandle": null}], "nodes": [{"id": "A1_1751073324228", "data": {"icon": "gauge", "label": "감압기", "status": "STOP", "equipmentCode": "A101", "equipmentName": "감압기", "equipmentType": "A1", "displayMeasurements": ["TG-001", "TG-002"]}, "type": "equipment", "style": {"width": 211, "height": 170}, "width": 211, "height": 170, "dragging": false, "position": {"x": 130, "y": 200}, "resizing": false, "selected": false, "positionAbsolute": {"x": 130, "y": 200}}, {"id": "B1_1751073343571", "data": {"icon": "activity", "label": "차압기", "status": "STOP", "equipmentCode": "B101", "equipmentName": "차압기", "equipmentType": "B1", "displayMeasurements": ["TF-928", "TF-929"]}, "type": "equipment", "style": {"width": 208, "height": 170}, "width": 208, "height": 170, "dragging": false, "position": {"x": 360, "y": 200}, "resizing": false, "selected": false, "positionAbsolute": {"x": 360, "y": 200}}, {"id": "C2_1751073352895", "data": {"icon": "thermometer", "label": "측정기", "status": "STOP", "equipmentCode": "C201", "equipmentName": "측정기", "equipmentType": "C2", "displayMeasurements": ["TS-201"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 135.5, "y": 525.6838827115021}, "selected": false, "positionAbsolute": {"x": 135.03774814099847, "y": 525.6838827115021}}, {"id": "D2_1751077257073", "data": {"icon": "zap", "label": "펌프", "status": "STOP", "equipmentCode": "D201", "equipmentName": "펌프", "equipmentType": "D2", "displayMeasurements": ["FL-201"]}, "type": "equipment", "style": {"width": 210, "height": 220}, "width": 210, "height": 220, "dragging": false, "position": {"x": 430, "y": 500}, "resizing": false, "selected": false, "positionAbsolute": {"x": 430, "y": 500}}, {"id": "group_1751077454819", "data": {"color": "#ff8080", "label": "Group"}, "type": "group", "style": {"width": 1276, "height": 808, "zIndex": -1}, "width": 1276, "height": 808, "dragging": false, "position": {"x": 40, "y": 120}, "resizing": false, "selected": false, "positionAbsolute": {"x": 40, "y": 120}}, {"id": "A1_1751083245170", "data": {"icon": "gauge", "label": "감압기", "status": "STOP", "equipmentCode": "A101", "equipmentName": "감압기", "equipmentType": "A1", "displayMeasurements": ["TG-001", "TG-002"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 660, "y": 530}, "selected": false, "positionAbsolute": {"x": 660, "y": 530}}, {"id": "D2_1751083266771", "data": {"icon": "zap", "label": "펌프", "status": "STOP", "equipmentCode": "D201", "equipmentName": "펌프", "equipmentType": "D2", "displayMeasurements": ["FL-201"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 720, "y": 200}, "selected": false, "positionAbsolute": {"x": 720, "y": 200}}, {"id": "B1_1751083289433", "data": {"icon": "activity", "label": "차압기", "status": "STOP", "equipmentCode": "B101", "equipmentName": "차압기", "equipmentType": "B1", "displayMeasurements": ["TF-928", "TF-929"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 930, "y": 200}, "selected": false, "positionAbsolute": {"x": 930, "y": 200}}, {"id": "A1_1751083312881", "data": {"icon": "gauge", "label": "감압기", "status": "STOP", "equipmentCode": "A101", "equipmentName": "감압기", "equipmentType": "A1", "displayMeasurements": ["TG-001", "TG-002"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 1000, "y": 550}, "selected": false, "positionAbsolute": {"x": 1000, "y": 550}}, {"id": "group_1751083444956", "data": {"color": "#3b82f6", "label": "Group"}, "type": "group", "style": {"width": 550, "height": 510, "zIndex": -1}, "width": 550, "height": 510, "dragging": false, "position": {"x": -1370, "y": 480}, "resizing": false, "selected": false, "positionAbsolute": {"x": -1370, "y": 480}}, {"id": "E2_1751083457125", "data": {"icon": "archive", "label": "저장탱크", "status": "STOP", "equipmentCode": "E201", "equipmentName": "저장탱크", "equipmentType": "E2", "displayMeasurements": []}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": -1250, "y": 580}, "selected": false, "positionAbsolute": {"x": -1250, "y": 580}}, {"id": "E1_1751083480473", "data": {"icon": "database", "label": "탱크", "status": "STOP", "equipmentCode": "E101", "equipmentName": "탱크", "equipmentType": "E1", "displayMeasurements": ["LV-101", "PR-101"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 720, "y": 1180}, "selected": false, "positionAbsolute": {"x": 720, "y": 1180}}, {"id": "group_1751083486315", "data": {"color": "#75f09a", "label": "Group"}, "type": "group", "style": {"width": 960, "height": 450, "zIndex": -1}, "width": 960, "height": 450, "dragging": false, "position": {"x": 50, "y": 1080}, "resizing": false, "selected": false, "positionAbsolute": {"x": 50, "y": 1080}}, {"id": "G1_1751083499986", "data": {"icon": "flame", "label": "히터", "status": "STOP", "equipmentCode": "G101", "equipmentName": "히터", "equipmentType": "G1", "displayMeasurements": ["TH-101", "PW-101"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 90, "y": 1170}, "selected": false, "positionAbsolute": {"x": 90, "y": 1170}}, {"id": "D1_1751083531907", "data": {"icon": "wind", "label": "압축기", "status": "STOP", "equipmentCode": "D101", "equipmentName": "압축기", "equipmentType": "D1", "displayMeasurements": ["PC-101", "TC-101"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 400, "y": 1170}, "selected": false, "positionAbsolute": {"x": 400, "y": 1170}}, {"id": "COMMON_1751546846753", "data": {"icon": "settings", "label": "공통설비", "status": "STOP", "equipmentCode": "", "equipmentName": "공통설비", "equipmentType": "COMMON", "displayMeasurements": []}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "position": {"x": -765, "y": 165}}]}', '샘플 공정도 - Version 2025. 7. 3. 오후 9:47:27', 'Saved from editor at 2025. 7. 3. 오후 9:47:27', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-03 21:47:27.852896+09', false, NULL, NULL, NULL);
INSERT INTO public.personal_test_process_flow_versions (id, flow_id, version_number, flow_data, name, description, created_by, created_at, is_published, published_at, publish_token, data_source_id) VALUES ('f3b36ab5-f31f-46c5-a3a1-154777277bf4', '116675b3-43cb-4a93-986b-e6c133204d16', 5, '{"edges": [{"id": "reactflow__edge-A1_1751073324228-C2_1751073352895", "type": "step", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "A1_1751073324228", "target": "C2_1751073352895", "animated": false, "selected": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-B1_1751073343571-D2_1751077257073", "type": "step", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "B1_1751073343571", "target": "D2_1751077257073", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-D2_1751083266771-A1_1751083245170", "type": "default", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "D2_1751083266771", "target": "A1_1751083245170", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-B1_1751083289433-A1_1751083312881", "type": "smoothstep", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "B1_1751083289433", "target": "A1_1751083312881", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-D2_1751077257073-E2_1751083457125", "type": "step", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "D2_1751077257073", "target": "E2_1751083457125", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-E2_1751083457125-G1_1751083499986", "type": "straight", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "E2_1751083457125", "target": "G1_1751083499986", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-G1_1751083499986-D1_1751083531907", "type": "smoothstep", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "G1_1751083499986", "target": "D1_1751083531907", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-D1_1751083531907-E1_1751083480473", "type": "default", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "D1_1751083531907", "target": "E1_1751083480473", "animated": false, "selectable": true, "sourceHandle": null, "targetHandle": null}], "nodes": [{"id": "A1_1751073324228", "data": {"icon": "gauge", "label": "감압기", "status": "STOP", "equipmentCode": "A101", "equipmentName": "감압기", "equipmentType": "A1", "displayMeasurements": ["TG-001", "TG-002"]}, "type": "equipment", "style": {"width": 211, "height": 170}, "width": 211, "height": 170, "dragging": false, "position": {"x": 130, "y": 200}, "resizing": false, "selected": false, "positionAbsolute": {"x": 130, "y": 200}}, {"id": "B1_1751073343571", "data": {"icon": "activity", "label": "차압기", "status": "STOP", "equipmentCode": "B101", "equipmentName": "차압기", "equipmentType": "B1", "displayMeasurements": ["TF-928", "TF-929"]}, "type": "equipment", "style": {"width": 208, "height": 170}, "width": 208, "height": 170, "dragging": false, "position": {"x": 360, "y": 200}, "resizing": false, "selected": false, "positionAbsolute": {"x": 360, "y": 200}}, {"id": "C2_1751073352895", "data": {"icon": "thermometer", "label": "측정기", "status": "STOP", "equipmentCode": "C201", "equipmentName": "측정기", "equipmentType": "C2", "displayMeasurements": ["TS-201"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 135.5, "y": 525.6838827115021}, "selected": false, "positionAbsolute": {"x": 135.03774814099847, "y": 525.6838827115021}}, {"id": "D2_1751077257073", "data": {"icon": "zap", "label": "펌프", "status": "STOP", "equipmentCode": "D201", "equipmentName": "펌프", "equipmentType": "D2", "displayMeasurements": ["FL-201"]}, "type": "equipment", "style": {"width": 210, "height": 220}, "width": 210, "height": 220, "dragging": false, "position": {"x": 430, "y": 500}, "resizing": false, "selected": false, "positionAbsolute": {"x": 430, "y": 500}}, {"id": "group_1751077454819", "data": {"color": "#ff8080", "label": "Group"}, "type": "group", "style": {"width": 1276, "height": 808, "zIndex": -1}, "width": 1276, "height": 808, "dragging": false, "position": {"x": 40, "y": 120}, "resizing": false, "selected": false, "positionAbsolute": {"x": 40, "y": 120}}, {"id": "A1_1751083245170", "data": {"icon": "gauge", "label": "감압기", "status": "STOP", "equipmentCode": "A101", "equipmentName": "감압기", "equipmentType": "A1", "displayMeasurements": ["TG-001", "TG-002"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 660, "y": 530}, "selected": false, "positionAbsolute": {"x": 660, "y": 530}}, {"id": "D2_1751083266771", "data": {"icon": "zap", "label": "펌프", "status": "STOP", "equipmentCode": "D201", "equipmentName": "펌프", "equipmentType": "D2", "displayMeasurements": ["FL-201"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 720, "y": 200}, "selected": false, "positionAbsolute": {"x": 720, "y": 200}}, {"id": "B1_1751083289433", "data": {"icon": "activity", "label": "차압기", "status": "STOP", "equipmentCode": "B101", "equipmentName": "차압기", "equipmentType": "B1", "displayMeasurements": ["TF-928", "TF-929"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 930, "y": 200}, "selected": false, "positionAbsolute": {"x": 930, "y": 200}}, {"id": "A1_1751083312881", "data": {"icon": "gauge", "label": "감압기", "status": "STOP", "equipmentCode": "A101", "equipmentName": "감압기", "equipmentType": "A1", "displayMeasurements": ["TG-001", "TG-002"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 1000, "y": 550}, "selected": false, "positionAbsolute": {"x": 1000, "y": 550}}, {"id": "group_1751083444956", "data": {"color": "#3b82f6", "label": "Group"}, "type": "group", "style": {"width": 550, "height": 510, "zIndex": -1}, "width": 550, "height": 510, "dragging": false, "position": {"x": -1370, "y": 480}, "resizing": false, "selected": false, "positionAbsolute": {"x": -1370, "y": 480}}, {"id": "E2_1751083457125", "data": {"icon": "archive", "label": "저장탱크", "status": "STOP", "equipmentCode": "E201", "equipmentName": "저장탱크", "equipmentType": "E2", "displayMeasurements": []}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": -1250, "y": 580}, "selected": false, "positionAbsolute": {"x": -1250, "y": 580}}, {"id": "E1_1751083480473", "data": {"icon": "database", "label": "탱크", "status": "STOP", "equipmentCode": "E101", "equipmentName": "탱크", "equipmentType": "E1", "displayMeasurements": ["LV-101", "PR-101"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 720, "y": 1180}, "selected": false, "positionAbsolute": {"x": 720, "y": 1180}}, {"id": "group_1751083486315", "data": {"color": "#75f09a", "label": "Group"}, "type": "group", "style": {"width": 960, "height": 450, "zIndex": -1}, "width": 960, "height": 450, "dragging": false, "position": {"x": 50, "y": 1080}, "resizing": false, "selected": false, "positionAbsolute": {"x": 50, "y": 1080}}, {"id": "G1_1751083499986", "data": {"icon": "flame", "label": "히터", "status": "STOP", "equipmentCode": "G101", "equipmentName": "히터", "equipmentType": "G1", "displayMeasurements": ["TH-101", "PW-101"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 90, "y": 1170}, "selected": false, "positionAbsolute": {"x": 90, "y": 1170}}, {"id": "D1_1751083531907", "data": {"icon": "wind", "label": "압축기", "status": "STOP", "equipmentCode": "D101", "equipmentName": "압축기", "equipmentType": "D1", "displayMeasurements": ["PC-101", "TC-101"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 400, "y": 1170}, "selected": false, "positionAbsolute": {"x": 400, "y": 1170}}, {"id": "text_1751547107155", "data": {"text": "Text", "color": "#000000", "fontSize": 14}, "type": "text", "width": 50, "height": 37, "dragging": false, "position": {"x": -690, "y": 345}, "selected": true}]}', '샘플 공정도 - Version 2025. 7. 3. 오후 9:51:59', 'Saved from editor at 2025. 7. 3. 오후 9:51:59', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-03 21:51:59.760594+09', false, NULL, NULL, NULL);
INSERT INTO public.personal_test_process_flow_versions (id, flow_id, version_number, flow_data, name, description, created_by, created_at, is_published, published_at, publish_token, data_source_id) VALUES ('30d2dc65-502f-49bb-9dcd-58b280e8dc6d', '116675b3-43cb-4a93-986b-e6c133204d16', 6, '{"edges": [{"id": "reactflow__edge-A1_1751073324228-C2_1751073352895", "type": "step", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "A1_1751073324228", "target": "C2_1751073352895", "animated": false, "selected": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-B1_1751073343571-D2_1751077257073", "type": "step", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "B1_1751073343571", "target": "D2_1751077257073", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-D2_1751083266771-A1_1751083245170", "type": "default", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "D2_1751083266771", "target": "A1_1751083245170", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-B1_1751083289433-A1_1751083312881", "type": "smoothstep", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "B1_1751083289433", "target": "A1_1751083312881", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-D2_1751077257073-E2_1751083457125", "type": "step", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "D2_1751077257073", "target": "E2_1751083457125", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-E2_1751083457125-G1_1751083499986", "type": "straight", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "E2_1751083457125", "target": "G1_1751083499986", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-G1_1751083499986-D1_1751083531907", "type": "smoothstep", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "G1_1751083499986", "target": "D1_1751083531907", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-D1_1751083531907-E1_1751083480473", "type": "default", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "D1_1751083531907", "target": "E1_1751083480473", "animated": false, "selectable": true, "sourceHandle": null, "targetHandle": null}], "nodes": [{"id": "A1_1751073324228", "data": {"icon": "gauge", "label": "감압기", "status": "STOP", "equipmentCode": "A101", "equipmentName": "감압기", "equipmentType": "A1", "displayMeasurements": ["TG-001", "TG-002"]}, "type": "equipment", "style": {"width": 211, "height": 170}, "width": 211, "height": 170, "dragging": false, "position": {"x": 130, "y": 200}, "resizing": false, "selected": false, "positionAbsolute": {"x": 130, "y": 200}}, {"id": "B1_1751073343571", "data": {"icon": "activity", "label": "차압기", "status": "STOP", "equipmentCode": "B101", "equipmentName": "차압기", "equipmentType": "B1", "displayMeasurements": ["TF-928", "TF-929"]}, "type": "equipment", "style": {"width": 208, "height": 170}, "width": 208, "height": 170, "dragging": false, "position": {"x": 360, "y": 200}, "resizing": false, "selected": false, "positionAbsolute": {"x": 360, "y": 200}}, {"id": "C2_1751073352895", "data": {"icon": "thermometer", "label": "측정기", "status": "STOP", "equipmentCode": "C201", "equipmentName": "측정기", "equipmentType": "C2", "displayMeasurements": ["TS-201"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 135.5, "y": 525.6838827115021}, "selected": false, "positionAbsolute": {"x": 135.03774814099847, "y": 525.6838827115021}}, {"id": "D2_1751077257073", "data": {"icon": "zap", "label": "펌프", "status": "STOP", "equipmentCode": "D201", "equipmentName": "펌프", "equipmentType": "D2", "displayMeasurements": ["FL-201"]}, "type": "equipment", "style": {"width": 210, "height": 220}, "width": 210, "height": 220, "dragging": false, "position": {"x": 430, "y": 500}, "resizing": false, "selected": false, "positionAbsolute": {"x": 430, "y": 500}}, {"id": "group_1751077454819", "data": {"color": "#ff8080", "label": "Group"}, "type": "group", "style": {"width": 1276, "height": 808, "zIndex": -1}, "width": 1276, "height": 808, "dragging": false, "position": {"x": 40, "y": 120}, "resizing": false, "selected": false, "positionAbsolute": {"x": 40, "y": 120}}, {"id": "A1_1751083245170", "data": {"icon": "gauge", "label": "감압기", "status": "STOP", "equipmentCode": "A101", "equipmentName": "감압기", "equipmentType": "A1", "displayMeasurements": ["TG-001", "TG-002"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 660, "y": 530}, "selected": false, "positionAbsolute": {"x": 660, "y": 530}}, {"id": "D2_1751083266771", "data": {"icon": "zap", "label": "펌프", "status": "STOP", "equipmentCode": "D201", "equipmentName": "펌프", "equipmentType": "D2", "displayMeasurements": ["FL-201"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 720, "y": 200}, "selected": false, "positionAbsolute": {"x": 720, "y": 200}}, {"id": "B1_1751083289433", "data": {"icon": "activity", "label": "차압기", "status": "STOP", "equipmentCode": "B101", "equipmentName": "차압기", "equipmentType": "B1", "displayMeasurements": ["TF-928", "TF-929"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 930, "y": 200}, "selected": false, "positionAbsolute": {"x": 930, "y": 200}}, {"id": "A1_1751083312881", "data": {"icon": "gauge", "label": "감압기", "status": "STOP", "equipmentCode": "A101", "equipmentName": "감압기", "equipmentType": "A1", "displayMeasurements": ["TG-001", "TG-002"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 1000, "y": 550}, "selected": false, "positionAbsolute": {"x": 1000, "y": 550}}, {"id": "group_1751083444956", "data": {"color": "#3b82f6", "label": "Group"}, "type": "group", "style": {"width": 550, "height": 510, "zIndex": -1}, "width": 550, "height": 510, "dragging": false, "position": {"x": -1370, "y": 480}, "resizing": false, "selected": false, "positionAbsolute": {"x": -1370, "y": 480}}, {"id": "E2_1751083457125", "data": {"icon": "archive", "label": "저장탱크", "status": "STOP", "equipmentCode": "E201", "equipmentName": "저장탱크", "equipmentType": "E2", "displayMeasurements": []}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": -1250, "y": 580}, "selected": false, "positionAbsolute": {"x": -1250, "y": 580}}, {"id": "E1_1751083480473", "data": {"icon": "database", "label": "탱크", "status": "STOP", "equipmentCode": "E101", "equipmentName": "탱크", "equipmentType": "E1", "displayMeasurements": ["LV-101", "PR-101"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 720, "y": 1180}, "selected": false, "positionAbsolute": {"x": 720, "y": 1180}}, {"id": "group_1751083486315", "data": {"color": "#75f09a", "label": "Group"}, "type": "group", "style": {"width": 960, "height": 450, "zIndex": -1}, "width": 960, "height": 450, "dragging": false, "position": {"x": 50, "y": 1080}, "resizing": false, "selected": false, "positionAbsolute": {"x": 50, "y": 1080}}, {"id": "G1_1751083499986", "data": {"icon": "flame", "label": "히터", "status": "STOP", "equipmentCode": "G101", "equipmentName": "히터", "equipmentType": "G1", "displayMeasurements": ["TH-101", "PW-101"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 90, "y": 1170}, "selected": false, "positionAbsolute": {"x": 90, "y": 1170}}, {"id": "D1_1751083531907", "data": {"icon": "wind", "label": "압축기", "status": "STOP", "equipmentCode": "D101", "equipmentName": "압축기", "equipmentType": "D1", "displayMeasurements": ["PC-101", "TC-101"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 400, "y": 1170}, "selected": false, "positionAbsolute": {"x": 400, "y": 1170}}, {"id": "COMMON_1751546846753", "data": {"icon": "settings", "label": "공통설비", "status": "STOP", "equipmentCode": "", "equipmentName": "공통설비", "equipmentType": "COMMON", "displayMeasurements": []}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": -555, "y": 75}, "selected": false, "positionAbsolute": {"x": -555, "y": 75}}, {"id": "text_1751547206517", "data": {"text": "Text", "color": "#000000", "padding": 8, "fontSize": 14, "textAlign": "center", "fontWeight": "normal", "borderColor": "#999999", "borderStyle": "none", "borderWidth": 1, "backgroundColor": "#ffffff"}, "type": "text", "width": 50, "height": 37, "dragging": false, "position": {"x": -315, "y": -15}, "selected": true}]}', '샘플 공정도 - Version 2025. 7. 3. 오후 9:53:33', 'Saved from editor at 2025. 7. 3. 오후 9:53:33', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-03 21:53:33.042345+09', false, NULL, NULL, NULL);
INSERT INTO public.personal_test_process_flow_versions (id, flow_id, version_number, flow_data, name, description, created_by, created_at, is_published, published_at, publish_token, data_source_id) VALUES ('372acfdb-847d-4c9c-8a5c-2bd56390a01d', '116675b3-43cb-4a93-986b-e6c133204d16', 7, '{"edges": [{"id": "reactflow__edge-A1_1751073324228-C2_1751073352895", "type": "step", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "A1_1751073324228", "target": "C2_1751073352895", "animated": false, "selected": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-B1_1751073343571-D2_1751077257073", "type": "step", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "B1_1751073343571", "target": "D2_1751077257073", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-D2_1751083266771-A1_1751083245170", "type": "default", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "D2_1751083266771", "target": "A1_1751083245170", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-B1_1751083289433-A1_1751083312881", "type": "smoothstep", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "B1_1751083289433", "target": "A1_1751083312881", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-D2_1751077257073-E2_1751083457125", "type": "step", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "D2_1751077257073", "target": "E2_1751083457125", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-E2_1751083457125-G1_1751083499986", "type": "straight", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "E2_1751083457125", "target": "G1_1751083499986", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-G1_1751083499986-D1_1751083531907", "type": "smoothstep", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "G1_1751083499986", "target": "D1_1751083531907", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-D1_1751083531907-E1_1751083480473", "type": "default", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "D1_1751083531907", "target": "E1_1751083480473", "animated": false, "selectable": true, "sourceHandle": null, "targetHandle": null}], "nodes": [{"id": "A1_1751073324228", "data": {"icon": "gauge", "label": "감압기", "status": "STOP", "equipmentCode": "A101", "equipmentName": "감압기", "equipmentType": "A1", "displayMeasurements": ["TG-001", "TG-002"]}, "type": "equipment", "style": {"width": 211, "height": 170}, "width": 211, "height": 170, "dragging": false, "position": {"x": 130, "y": 200}, "resizing": false, "selected": false, "positionAbsolute": {"x": 130, "y": 200}}, {"id": "B1_1751073343571", "data": {"icon": "activity", "label": "차압기", "status": "STOP", "equipmentCode": "B101", "equipmentName": "차압기", "equipmentType": "B1", "displayMeasurements": ["TF-928", "TF-929"]}, "type": "equipment", "style": {"width": 208, "height": 170}, "width": 208, "height": 170, "dragging": false, "position": {"x": 360, "y": 200}, "resizing": false, "selected": false, "positionAbsolute": {"x": 360, "y": 200}}, {"id": "C2_1751073352895", "data": {"icon": "thermometer", "label": "측정기", "status": "STOP", "equipmentCode": "C201", "equipmentName": "측정기", "equipmentType": "C2", "displayMeasurements": ["TS-201"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 135.5, "y": 525.6838827115021}, "selected": false, "positionAbsolute": {"x": 135.03774814099847, "y": 525.6838827115021}}, {"id": "D2_1751077257073", "data": {"icon": "zap", "label": "펌프", "status": "STOP", "equipmentCode": "D201", "equipmentName": "펌프", "equipmentType": "D2", "displayMeasurements": ["FL-201"]}, "type": "equipment", "style": {"width": 210, "height": 220}, "width": 210, "height": 220, "dragging": false, "position": {"x": 430, "y": 500}, "resizing": false, "selected": false, "positionAbsolute": {"x": 430, "y": 500}}, {"id": "group_1751077454819", "data": {"color": "#ff8080", "label": "Group"}, "type": "group", "style": {"width": 1276, "height": 808, "zIndex": -1}, "width": 1276, "height": 808, "dragging": false, "position": {"x": 40, "y": 120}, "resizing": false, "selected": false, "positionAbsolute": {"x": 40, "y": 120}}, {"id": "A1_1751083245170", "data": {"icon": "gauge", "label": "감압기", "status": "STOP", "equipmentCode": "A101", "equipmentName": "감압기", "equipmentType": "A1", "displayMeasurements": ["TG-001", "TG-002"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 660, "y": 530}, "selected": false, "positionAbsolute": {"x": 660, "y": 530}}, {"id": "D2_1751083266771", "data": {"icon": "zap", "label": "펌프", "status": "STOP", "equipmentCode": "D201", "equipmentName": "펌프", "equipmentType": "D2", "displayMeasurements": ["FL-201"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 720, "y": 200}, "selected": false, "positionAbsolute": {"x": 720, "y": 200}}, {"id": "B1_1751083289433", "data": {"icon": "activity", "label": "차압기", "status": "STOP", "equipmentCode": "B101", "equipmentName": "차압기", "equipmentType": "B1", "displayMeasurements": ["TF-928", "TF-929"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 930, "y": 200}, "selected": false, "positionAbsolute": {"x": 930, "y": 200}}, {"id": "A1_1751083312881", "data": {"icon": "gauge", "label": "감압기", "status": "STOP", "equipmentCode": "A101", "equipmentName": "감압기", "equipmentType": "A1", "displayMeasurements": ["TG-001", "TG-002"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 1000, "y": 550}, "selected": false, "positionAbsolute": {"x": 1000, "y": 550}}, {"id": "group_1751083444956", "data": {"color": "#3b82f6", "label": "Group"}, "type": "group", "style": {"width": 550, "height": 510, "zIndex": -1}, "width": 550, "height": 510, "dragging": false, "position": {"x": -1370, "y": 480}, "resizing": false, "selected": false, "positionAbsolute": {"x": -1370, "y": 480}}, {"id": "E2_1751083457125", "data": {"icon": "archive", "label": "저장탱크", "status": "STOP", "equipmentCode": "E201", "equipmentName": "저장탱크", "equipmentType": "E2", "displayMeasurements": []}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": -1250, "y": 580}, "selected": false, "positionAbsolute": {"x": -1250, "y": 580}}, {"id": "E1_1751083480473", "data": {"icon": "database", "label": "탱크", "status": "STOP", "equipmentCode": "E101", "equipmentName": "탱크", "equipmentType": "E1", "displayMeasurements": ["LV-101", "PR-101"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 720, "y": 1180}, "selected": false, "positionAbsolute": {"x": 720, "y": 1180}}, {"id": "group_1751083486315", "data": {"color": "#75f09a", "label": "Group"}, "type": "group", "style": {"width": 960, "height": 450, "zIndex": -1}, "width": 960, "height": 450, "dragging": false, "position": {"x": 50, "y": 1080}, "resizing": false, "selected": false, "positionAbsolute": {"x": 50, "y": 1080}}, {"id": "G1_1751083499986", "data": {"icon": "flame", "label": "히터", "status": "STOP", "equipmentCode": "G101", "equipmentName": "히터", "equipmentType": "G1", "displayMeasurements": ["TH-101", "PW-101"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 90, "y": 1170}, "selected": false, "positionAbsolute": {"x": 90, "y": 1170}}, {"id": "D1_1751083531907", "data": {"icon": "wind", "label": "압축기", "status": "STOP", "equipmentCode": "D101", "equipmentName": "압축기", "equipmentType": "D1", "displayMeasurements": ["PC-101", "TC-101"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 400, "y": 1170}, "selected": false, "positionAbsolute": {"x": 400, "y": 1170}}, {"id": "COMMON_1751546846753", "data": {"icon": "settings", "label": "공통설비", "status": "STOP", "equipmentCode": "", "equipmentName": "공통설비", "equipmentType": "COMMON", "displayMeasurements": []}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "position": {"x": -765, "y": 165}}, {"id": "text_1751547256763", "data": {"text": "Text", "color": "#000000", "fontSize": 14}, "type": "text", "width": 50, "height": 37, "position": {"x": -225, "y": 0}}]}', '샘플 공정도 - Version 2025. 7. 3. 오후 9:54:18', 'Saved from editor at 2025. 7. 3. 오후 9:54:18', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-03 21:54:18.247571+09', false, NULL, NULL, NULL);
INSERT INTO public.personal_test_process_flow_versions (id, flow_id, version_number, flow_data, name, description, created_by, created_at, is_published, published_at, publish_token, data_source_id) VALUES ('9c48242e-7991-43c1-80d6-b9ee98b316e3', '116675b3-43cb-4a93-986b-e6c133204d16', 8, '{"edges": [{"id": "reactflow__edge-A1_1751073324228-C2_1751073352895", "type": "step", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "A1_1751073324228", "target": "C2_1751073352895", "animated": false, "selected": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-B1_1751073343571-D2_1751077257073", "type": "step", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "B1_1751073343571", "target": "D2_1751077257073", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-D2_1751083266771-A1_1751083245170", "type": "default", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "D2_1751083266771", "target": "A1_1751083245170", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-B1_1751083289433-A1_1751083312881", "type": "smoothstep", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "B1_1751083289433", "target": "A1_1751083312881", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-D2_1751077257073-E2_1751083457125", "type": "step", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "D2_1751077257073", "target": "E2_1751083457125", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-E2_1751083457125-G1_1751083499986", "type": "straight", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "E2_1751083457125", "target": "G1_1751083499986", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-G1_1751083499986-D1_1751083531907", "type": "smoothstep", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "G1_1751083499986", "target": "D1_1751083531907", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-D1_1751083531907-E1_1751083480473", "type": "default", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "D1_1751083531907", "target": "E1_1751083480473", "animated": false, "selectable": true, "sourceHandle": null, "targetHandle": null}], "nodes": [{"id": "A1_1751073324228", "data": {"icon": "gauge", "label": "감압기", "status": "STOP", "equipmentCode": "A101", "equipmentName": "감압기", "equipmentType": "A1", "displayMeasurements": ["TG-001", "TG-002"]}, "type": "equipment", "style": {"width": 211, "height": 170}, "width": 211, "height": 170, "dragging": false, "position": {"x": 130, "y": 200}, "resizing": false, "selected": false, "positionAbsolute": {"x": 130, "y": 200}}, {"id": "B1_1751073343571", "data": {"icon": "activity", "label": "차압기", "status": "STOP", "equipmentCode": "B101", "equipmentName": "차압기", "equipmentType": "B1", "displayMeasurements": ["TF-928", "TF-929"]}, "type": "equipment", "style": {"width": 208, "height": 170}, "width": 208, "height": 170, "dragging": false, "position": {"x": 360, "y": 200}, "resizing": false, "selected": false, "positionAbsolute": {"x": 360, "y": 200}}, {"id": "C2_1751073352895", "data": {"icon": "thermometer", "label": "측정기", "status": "STOP", "equipmentCode": "C201", "equipmentName": "측정기", "equipmentType": "C2", "displayMeasurements": ["TS-201"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 135.5, "y": 525.6838827115021}, "selected": false, "positionAbsolute": {"x": 135.03774814099847, "y": 525.6838827115021}}, {"id": "D2_1751077257073", "data": {"icon": "zap", "label": "펌프", "status": "STOP", "equipmentCode": "D201", "equipmentName": "펌프", "equipmentType": "D2", "displayMeasurements": ["FL-201"]}, "type": "equipment", "style": {"width": 210, "height": 220}, "width": 210, "height": 220, "dragging": false, "position": {"x": 430, "y": 500}, "resizing": false, "selected": false, "positionAbsolute": {"x": 430, "y": 500}}, {"id": "group_1751077454819", "data": {"color": "#ff8080", "label": "Group"}, "type": "group", "style": {"width": 1276, "height": 808, "zIndex": -1}, "width": 1276, "height": 808, "dragging": false, "position": {"x": 40, "y": 120}, "resizing": false, "selected": false, "positionAbsolute": {"x": 40, "y": 120}}, {"id": "A1_1751083245170", "data": {"icon": "gauge", "label": "감압기", "status": "STOP", "equipmentCode": "A101", "equipmentName": "감압기", "equipmentType": "A1", "displayMeasurements": ["TG-001", "TG-002"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 660, "y": 530}, "selected": false, "positionAbsolute": {"x": 660, "y": 530}}, {"id": "D2_1751083266771", "data": {"icon": "zap", "label": "펌프", "status": "STOP", "equipmentCode": "D201", "equipmentName": "펌프", "equipmentType": "D2", "displayMeasurements": ["FL-201"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 720, "y": 200}, "selected": false, "positionAbsolute": {"x": 720, "y": 200}}, {"id": "B1_1751083289433", "data": {"icon": "activity", "label": "차압기", "status": "STOP", "equipmentCode": "B101", "equipmentName": "차압기", "equipmentType": "B1", "displayMeasurements": ["TF-928", "TF-929"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 930, "y": 200}, "selected": false, "positionAbsolute": {"x": 930, "y": 200}}, {"id": "A1_1751083312881", "data": {"icon": "gauge", "label": "감압기", "status": "STOP", "equipmentCode": "A101", "equipmentName": "감압기", "equipmentType": "A1", "displayMeasurements": ["TG-001", "TG-002"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 1000, "y": 550}, "selected": false, "positionAbsolute": {"x": 1000, "y": 550}}, {"id": "group_1751083444956", "data": {"color": "#3b82f6", "label": "Group"}, "type": "group", "style": {"width": 550, "height": 510, "zIndex": -1}, "width": 550, "height": 510, "dragging": false, "position": {"x": -1370, "y": 480}, "resizing": false, "selected": false, "positionAbsolute": {"x": -1370, "y": 480}}, {"id": "E2_1751083457125", "data": {"icon": "archive", "label": "저장탱크", "status": "STOP", "equipmentCode": "E201", "equipmentName": "저장탱크", "equipmentType": "E2", "displayMeasurements": []}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": -1250, "y": 580}, "selected": false, "positionAbsolute": {"x": -1250, "y": 580}}, {"id": "E1_1751083480473", "data": {"icon": "database", "label": "탱크", "status": "STOP", "equipmentCode": "E101", "equipmentName": "탱크", "equipmentType": "E1", "displayMeasurements": ["LV-101", "PR-101"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 720, "y": 1180}, "selected": false, "positionAbsolute": {"x": 720, "y": 1180}}, {"id": "group_1751083486315", "data": {"color": "#75f09a", "label": "Group"}, "type": "group", "style": {"width": 960, "height": 450, "zIndex": -1}, "width": 960, "height": 450, "dragging": false, "position": {"x": 50, "y": 1080}, "resizing": false, "selected": false, "positionAbsolute": {"x": 50, "y": 1080}}, {"id": "G1_1751083499986", "data": {"icon": "flame", "label": "히터", "status": "STOP", "equipmentCode": "G101", "equipmentName": "히터", "equipmentType": "G1", "displayMeasurements": ["TH-101", "PW-101"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 90, "y": 1170}, "selected": false, "positionAbsolute": {"x": 90, "y": 1170}}, {"id": "D1_1751083531907", "data": {"icon": "wind", "label": "압축기", "status": "STOP", "equipmentCode": "D101", "equipmentName": "압축기", "equipmentType": "D1", "displayMeasurements": ["PC-101", "TC-101"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 400, "y": 1170}, "selected": false, "positionAbsolute": {"x": 400, "y": 1170}}, {"id": "COMMON_1751546846753", "data": {"icon": "settings", "label": "공통설비", "status": "STOP", "equipmentCode": "", "equipmentName": "공통설비", "equipmentType": "COMMON", "displayMeasurements": []}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": -555, "y": 75}, "selected": false, "positionAbsolute": {"x": -555, "y": 75}}, {"id": "text_1751547206517", "data": {"text": "Text", "color": "#000000", "padding": 8, "fontSize": 14, "textAlign": "center", "fontWeight": "normal", "borderColor": "#999999", "borderStyle": "none", "borderWidth": 1, "backgroundColor": "#ffffff"}, "type": "text", "width": 50, "height": 37, "dragging": false, "position": {"x": -315, "y": -15}, "selected": false}, {"id": "text_1751547574665", "data": {"text": "Text", "color": "#000000", "fontSize": 14}, "type": "text", "width": 50, "height": 37, "dragging": false, "position": {"x": 120, "y": -15}, "selected": false}]}', '샘플 공정도 - Version 2025. 7. 3. 오후 9:59:38', 'Saved from editor at 2025. 7. 3. 오후 9:59:38', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-03 21:59:38.517208+09', false, NULL, NULL, NULL);
INSERT INTO public.personal_test_process_flow_versions (id, flow_id, version_number, flow_data, name, description, created_by, created_at, is_published, published_at, publish_token, data_source_id) VALUES ('48582e9c-85ae-45d7-89f7-83721bae7e0f', '116675b3-43cb-4a93-986b-e6c133204d16', 9, '{"edges": [{"id": "reactflow__edge-A1_1751073324228-C2_1751073352895", "type": "step", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "A1_1751073324228", "target": "C2_1751073352895", "animated": false, "selected": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-B1_1751073343571-D2_1751077257073", "type": "step", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "B1_1751073343571", "target": "D2_1751077257073", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-D2_1751083266771-A1_1751083245170", "type": "default", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "D2_1751083266771", "target": "A1_1751083245170", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-B1_1751083289433-A1_1751083312881", "type": "smoothstep", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "B1_1751083289433", "target": "A1_1751083312881", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-D2_1751077257073-E2_1751083457125", "type": "step", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "D2_1751077257073", "target": "E2_1751083457125", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-E2_1751083457125-G1_1751083499986", "type": "straight", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "E2_1751083457125", "target": "G1_1751083499986", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-G1_1751083499986-D1_1751083531907", "type": "smoothstep", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "G1_1751083499986", "target": "D1_1751083531907", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-D1_1751083531907-E1_1751083480473", "type": "default", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "D1_1751083531907", "target": "E1_1751083480473", "animated": false, "selectable": true, "sourceHandle": null, "targetHandle": null}], "nodes": [{"id": "A1_1751073324228", "data": {"icon": "gauge", "label": "감압기", "status": "STOP", "equipmentCode": "A101", "equipmentName": "감압기", "equipmentType": "A1", "displayMeasurements": ["TG-001", "TG-002"]}, "type": "equipment", "style": {"width": 211, "height": 170}, "width": 211, "height": 170, "dragging": false, "position": {"x": 130, "y": 200}, "resizing": false, "selected": false, "positionAbsolute": {"x": 130, "y": 200}}, {"id": "B1_1751073343571", "data": {"icon": "activity", "label": "차압기", "status": "STOP", "equipmentCode": "B101", "equipmentName": "차압기", "equipmentType": "B1", "displayMeasurements": ["TF-928", "TF-929"]}, "type": "equipment", "style": {"width": 208, "height": 170}, "width": 208, "height": 170, "dragging": false, "position": {"x": 360, "y": 200}, "resizing": false, "selected": false, "positionAbsolute": {"x": 360, "y": 200}}, {"id": "C2_1751073352895", "data": {"icon": "thermometer", "label": "측정기", "status": "STOP", "equipmentCode": "C201", "equipmentName": "측정기", "equipmentType": "C2", "displayMeasurements": ["TS-201"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 135.5, "y": 525.6838827115021}, "selected": false, "positionAbsolute": {"x": 135.03774814099847, "y": 525.6838827115021}}, {"id": "D2_1751077257073", "data": {"icon": "zap", "label": "펌프", "status": "STOP", "equipmentCode": "D201", "equipmentName": "펌프", "equipmentType": "D2", "displayMeasurements": ["FL-201"]}, "type": "equipment", "style": {"width": 210, "height": 220}, "width": 210, "height": 220, "dragging": false, "position": {"x": 430, "y": 500}, "resizing": false, "selected": false, "positionAbsolute": {"x": 430, "y": 500}}, {"id": "group_1751077454819", "data": {"color": "#ff8080", "label": "Group"}, "type": "group", "style": {"width": 1276, "height": 808, "zIndex": -1}, "width": 1276, "height": 808, "dragging": false, "position": {"x": 40, "y": 120}, "resizing": false, "selected": false, "positionAbsolute": {"x": 40, "y": 120}}, {"id": "A1_1751083245170", "data": {"icon": "gauge", "label": "감압기", "status": "STOP", "equipmentCode": "A101", "equipmentName": "감압기", "equipmentType": "A1", "displayMeasurements": ["TG-001", "TG-002"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 660, "y": 530}, "selected": false, "positionAbsolute": {"x": 660, "y": 530}}, {"id": "D2_1751083266771", "data": {"icon": "zap", "label": "펌프", "status": "STOP", "equipmentCode": "D201", "equipmentName": "펌프", "equipmentType": "D2", "displayMeasurements": ["FL-201"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 720, "y": 200}, "selected": false, "positionAbsolute": {"x": 720, "y": 200}}, {"id": "B1_1751083289433", "data": {"icon": "activity", "label": "차압기", "status": "STOP", "equipmentCode": "B101", "equipmentName": "차압기", "equipmentType": "B1", "displayMeasurements": ["TF-928", "TF-929"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 930, "y": 200}, "selected": false, "positionAbsolute": {"x": 930, "y": 200}}, {"id": "A1_1751083312881", "data": {"icon": "gauge", "label": "감압기", "status": "STOP", "equipmentCode": "A101", "equipmentName": "감압기", "equipmentType": "A1", "displayMeasurements": ["TG-001", "TG-002"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 1000, "y": 550}, "selected": false, "positionAbsolute": {"x": 1000, "y": 550}}, {"id": "group_1751083444956", "data": {"color": "#3b82f6", "label": "Group"}, "type": "group", "style": {"width": 550, "height": 510, "zIndex": -1}, "width": 550, "height": 510, "dragging": false, "position": {"x": -1370, "y": 480}, "resizing": false, "selected": false, "positionAbsolute": {"x": -1370, "y": 480}}, {"id": "E2_1751083457125", "data": {"icon": "archive", "label": "저장탱크", "status": "STOP", "equipmentCode": "E201", "equipmentName": "저장탱크", "equipmentType": "E2", "displayMeasurements": []}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": -1250, "y": 580}, "selected": false, "positionAbsolute": {"x": -1250, "y": 580}}, {"id": "E1_1751083480473", "data": {"icon": "database", "label": "탱크", "status": "STOP", "equipmentCode": "E101", "equipmentName": "탱크", "equipmentType": "E1", "displayMeasurements": ["LV-101", "PR-101"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 720, "y": 1180}, "selected": false, "positionAbsolute": {"x": 720, "y": 1180}}, {"id": "group_1751083486315", "data": {"color": "#75f09a", "label": "Group"}, "type": "group", "style": {"width": 960, "height": 450, "zIndex": -1}, "width": 960, "height": 450, "dragging": false, "position": {"x": 50, "y": 1080}, "resizing": false, "selected": false, "positionAbsolute": {"x": 50, "y": 1080}}, {"id": "G1_1751083499986", "data": {"icon": "flame", "label": "히터", "status": "STOP", "equipmentCode": "G101", "equipmentName": "히터", "equipmentType": "G1", "displayMeasurements": ["TH-101", "PW-101"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 90, "y": 1170}, "selected": false, "positionAbsolute": {"x": 90, "y": 1170}}, {"id": "D1_1751083531907", "data": {"icon": "wind", "label": "압축기", "status": "STOP", "equipmentCode": "D101", "equipmentName": "압축기", "equipmentType": "D1", "displayMeasurements": ["PC-101", "TC-101"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 400, "y": 1170}, "selected": false, "positionAbsolute": {"x": 400, "y": 1170}}, {"id": "COMMON_1751546846753", "data": {"icon": "settings", "label": "공통설비", "status": "STOP", "equipmentCode": "", "equipmentName": "공통설비", "equipmentType": "COMMON", "displayMeasurements": []}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "position": {"x": -765, "y": 165}}, {"id": "text_1751547256763", "data": {"text": "Text", "color": "#000000", "fontSize": 14}, "type": "text", "width": 50, "height": 37, "position": {"x": -225, "y": 0}}]}', '샘플 공정도 - Version 2025. 7. 3. 오후 10:08:01', 'Saved from editor at 2025. 7. 3. 오후 10:08:01', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-03 22:08:01.124376+09', false, NULL, NULL, NULL);
INSERT INTO public.personal_test_process_flow_versions (id, flow_id, version_number, flow_data, name, description, created_by, created_at, is_published, published_at, publish_token, data_source_id) VALUES ('ab02ad1d-57cc-4eb9-9850-131310ed800c', '61312006-6173-4f9f-8a53-61b55843b37b', 1, '{"edges": [{"id": "reactflow__edge-COMMON_1751893388712-COMMON_1751893502330", "type": "step", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1751893388712", "target": "COMMON_1751893502330", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-COMMON_1751893502330-COMMON_1751893514184", "type": "step", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1751893502330", "target": "COMMON_1751893514184", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-COMMON_1751893514184-COMMON_1751893525392", "type": "step", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1751893514184", "target": "COMMON_1751893525392", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-COMMON_1751893525392-COMMON_1751893551682", "type": "step", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1751893525392", "target": "COMMON_1751893551682", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-COMMON_1751893551682-COMMON_1751893536842", "type": "step", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1751893551682", "target": "COMMON_1751893536842", "animated": false, "sourceHandle": null, "targetHandle": null}], "nodes": [{"id": "COMMON_1751893388712", "data": {"icon": "settings", "label": "감압기", "status": "STOP", "equipmentCode": "A101", "equipmentName": "감압기", "equipmentType": "A1", "displayMeasurements": ["TG-001", "TG-002"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 555, "y": 135}, "selected": false, "positionAbsolute": {"x": 555, "y": 135}}, {"id": "COMMON_1751893502330", "data": {"icon": "settings", "label": "차압기", "status": "STOP", "equipmentCode": "B101", "equipmentName": "차압기", "equipmentType": "B1", "displayMeasurements": ["TF-928", "TF-929"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 795, "y": 135}, "selected": false, "positionAbsolute": {"x": 795, "y": 135}}, {"id": "COMMON_1751893514184", "data": {"icon": "settings", "label": "흡착기", "status": "STOP", "equipmentCode": "C101", "equipmentName": "흡착기", "equipmentType": "C1", "displayMeasurements": ["TP-102", "TP-101"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 795, "y": 345}, "selected": false, "positionAbsolute": {"x": 795, "y": 345}}, {"id": "COMMON_1751893525392", "data": {"icon": "settings", "label": "측정기", "status": "STOP", "equipmentCode": "C201", "equipmentName": "측정기", "equipmentType": "C2", "displayMeasurements": ["TS-201"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 795, "y": 540}, "selected": false, "positionAbsolute": {"x": 795, "y": 540}}, {"id": "COMMON_1751893536842", "data": {"icon": "settings", "label": "압축기", "status": "STOP", "equipmentCode": "D101", "equipmentName": "압축기", "equipmentType": "D1", "displayMeasurements": ["PC-101", "TC-101"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 1065, "y": 540}, "selected": false, "positionAbsolute": {"x": 1065, "y": 540}}, {"id": "COMMON_1751893551682", "data": {"icon": "settings", "label": "탱크", "status": "STOP", "equipmentCode": "E101", "equipmentName": "탱크", "equipmentType": "E1", "displayMeasurements": ["LV-101", "PR-101"]}, "type": "equipment", "style": {"width": 200, "height": 270}, "width": 200, "height": 270, "dragging": false, "position": {"x": 1065, "y": 240}, "selected": false, "positionAbsolute": {"x": 1065, "y": 240}}]}', 'New Process Flow - Version 2025. 7. 7. 오후 10:28:12', 'Saved from editor at 2025. 7. 7. 오후 10:28:12', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-07 22:28:12.048168+09', false, NULL, NULL, NULL);
INSERT INTO public.personal_test_process_flow_versions (id, flow_id, version_number, flow_data, name, description, created_by, created_at, is_published, published_at, publish_token, data_source_id) VALUES ('8e66b662-8348-419f-8438-55e5c85efed2', '44254471-ea40-4866-9330-6012406e8cff', 1, '{"edges": [{"id": "reactflow__edge-COMMON_1752036246531-COMMON_1752036259739", "data": {"type": "step"}, "type": "step", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1752036246531", "target": "COMMON_1752036259739", "animated": false, "sourceHandle": null, "targetHandle": null}], "nodes": [{"id": "COMMON_1752036246531", "data": {"icon": "settings", "label": "Primary Heat Exchanger", "status": "STOP", "equipmentCode": "HEATEX-01", "equipmentName": "Primary Heat Exchanger", "equipmentType": "HeatExchanger", "displayMeasurements": ["HOUR-C01", "LOAD-C01", "FREQ-G01"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 765, "y": 120}, "selected": false, "positionAbsolute": {"x": 765, "y": 120}}, {"id": "COMMON_1752036259739", "data": {"icon": "settings", "label": "Tank Level Sensor", "status": "STOP", "equipmentCode": "SENSOR-L-01", "equipmentName": "Tank Level Sensor", "equipmentType": "Sensor", "displayMeasurements": ["P-C01-OUT", "T-004-MOT", "PRES-S01"]}, "type": "equipment", "style": {"width": 200, "height": 270}, "width": 200, "height": 270, "dragging": false, "position": {"x": 1080, "y": 90}, "selected": true, "positionAbsolute": {"x": 1080, "y": 90}}]}', 'nt - Version 2025. 7. 9. 오후 3:01:54', 'Saved from editor at 2025. 7. 9. 오후 3:01:54', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-09 15:01:55.354563+09', true, '2025-07-09 15:16:48.055346+09', 'zK62ELnYQtkw7lm4yoQAjk94DzdfACWhhGR-db86oto', NULL);


--
-- TOC entry 5124 (class 0 OID 19954)
-- Dependencies: 231
-- Data for Name: personal_test_process_flows; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.personal_test_process_flows (id, workspace_id, name, flow_data, created_by, created_at, updated_at, is_published, published_at, publish_token, current_version, data_source_id) VALUES ('9987a1a8-ea91-4b88-81b6-9b59cb423317', '21ee03db-90c4-4592-b00f-c44801e0b164', 'New Process Flow', '{"edges": [{"id": "reactflow__edge-A1_1751029300788-B1_1751029303260", "source": "A1_1751029300788", "target": "B1_1751029303260", "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-B1_1751029303260-C1_1751029308966", "source": "B1_1751029303260", "target": "C1_1751029308966", "sourceHandle": null, "targetHandle": null}], "nodes": [{"id": "A1_1751029300788", "data": {"icon": "gauge", "label": "감압기", "status": "STOP", "equipmentName": "감압기", "equipmentType": "A1"}, "type": "equipment", "width": 150, "height": 84, "dragging": false, "position": {"x": 10.508966731179726, "y": -90.13639232926076}, "selected": false, "positionAbsolute": {"x": 10.508966731179726, "y": -90.13639232926076}}, {"id": "B1_1751029303260", "data": {"icon": "activity", "label": "차압기", "status": "STOP", "equipmentName": "차압기", "equipmentType": "B1"}, "type": "equipment", "width": 150, "height": 84, "dragging": false, "position": {"x": 159.50747254529767, "y": 76.98505490940482}, "selected": false, "positionAbsolute": {"x": 159.50747254529767, "y": 76.98505490940482}}, {"id": "C1_1751029308966", "data": {"icon": "filter", "label": "흡착기", "status": "STOP", "equipmentName": "흡착기", "equipmentType": "C1"}, "type": "equipment", "width": 150, "height": 84, "dragging": false, "position": {"x": 548.6631667264176, "y": 170.24091945484332}, "selected": true, "positionAbsolute": {"x": 548.6631667264176, "y": 170.24091945484332}}, {"id": "C2_1751029364143", "data": {"icon": "thermometer", "label": "측정기", "status": "STOP", "equipmentName": "측정기", "equipmentType": "C2"}, "type": "equipment", "width": 150, "height": 84, "dragging": false, "position": {"x": 74.45412418235304, "y": 250}, "selected": false, "positionAbsolute": {"x": 74.45412418235304, "y": 250}}, {"id": "D1_1751029368314", "data": {"icon": "wind", "label": "압축기", "status": "STOP", "equipmentName": "압축기", "equipmentType": "D1"}, "type": "equipment", "width": 150, "height": 84, "position": {"x": 250, "y": 250}}, {"id": "D2_1751029369046", "data": {"icon": "zap", "label": "펌프", "status": "STOP", "equipmentName": "펌프", "equipmentType": "D2"}, "type": "equipment", "width": 150, "height": 84, "dragging": false, "position": {"x": 426.59704872673467, "y": 250}, "selected": false, "positionAbsolute": {"x": 426.59704872673467, "y": 250}}, {"id": "E1_1751029371078", "data": {"icon": "database", "label": "탱크", "status": "STOP", "equipmentName": "탱크", "equipmentType": "E1"}, "type": "equipment", "width": 150, "height": 84, "dragging": false, "position": {"x": 70.24943254600225, "y": 383.4989594541386}, "selected": false, "positionAbsolute": {"x": 70.24943254600225, "y": 383.4989594541386}}, {"id": "E2_1751029373161", "data": {"icon": "archive", "label": "저장탱크", "status": "STOP", "equipmentName": "저장탱크", "equipmentType": "E2"}, "type": "equipment", "width": 150, "height": 84, "dragging": false, "position": {"x": 263.6652478181402, "y": 380.34544072687555}, "selected": false, "positionAbsolute": {"x": 263.6652478181402, "y": 380.34544072687555}}, {"id": "F1_1751029374912", "data": {"icon": "git-merge", "label": "밸브", "status": "STOP", "equipmentName": "밸브", "equipmentType": "F1"}, "type": "equipment", "width": 150, "height": 84, "dragging": false, "position": {"x": 448.67167981757643, "y": 378.24309490870013}, "selected": false, "positionAbsolute": {"x": 448.67167981757643, "y": 378.24309490870013}}, {"id": "G1_1751029376756", "data": {"icon": "flame", "label": "히터", "status": "STOP", "equipmentName": "히터", "equipmentType": "G1"}, "type": "equipment", "width": 150, "height": 84, "dragging": false, "position": {"x": 635.7804576351881, "y": 390.85716981775266}, "selected": false, "positionAbsolute": {"x": 635.7804576351881, "y": 390.85716981775266}}]}', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-06-27 22:04:16.616456+09', '2025-06-27 22:04:16.616456+09', false, NULL, NULL, 1, '2881a01f-1eed-4343-b0d1-5d8d22f6744a');
INSERT INTO public.personal_test_process_flows (id, workspace_id, name, flow_data, created_by, created_at, updated_at, is_published, published_at, publish_token, current_version, data_source_id) VALUES ('61312006-6173-4f9f-8a53-61b55843b37b', '21ee03db-90c4-4592-b00f-c44801e0b164', 'New Process Flow', '{"edges": [{"id": "reactflow__edge-COMMON_1751893388712-COMMON_1751893502330", "type": "step", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1751893388712", "target": "COMMON_1751893502330", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-COMMON_1751893502330-COMMON_1751893514184", "type": "step", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1751893502330", "target": "COMMON_1751893514184", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-COMMON_1751893514184-COMMON_1751893525392", "type": "step", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1751893514184", "target": "COMMON_1751893525392", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-COMMON_1751893525392-COMMON_1751893551682", "type": "step", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1751893525392", "target": "COMMON_1751893551682", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-COMMON_1751893551682-COMMON_1751893536842", "type": "step", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1751893551682", "target": "COMMON_1751893536842", "animated": false, "sourceHandle": null, "targetHandle": null}], "nodes": [{"id": "COMMON_1751893388712", "data": {"icon": "settings", "label": "감압기", "status": "STOP", "equipmentCode": "A101", "equipmentName": "감압기", "equipmentType": "A1", "displayMeasurements": ["TG-001", "TG-002"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 435, "y": 135}, "selected": false, "positionAbsolute": {"x": 435, "y": 135}}, {"id": "COMMON_1751893502330", "data": {"icon": "settings", "label": "차압기", "status": "STOP", "equipmentCode": "B101", "equipmentName": "차압기", "equipmentType": "B1", "displayMeasurements": ["TF-928", "TF-929"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 795, "y": -15}, "selected": false, "positionAbsolute": {"x": 795, "y": -15}}, {"id": "COMMON_1751893514184", "data": {"icon": "settings", "label": "흡착기", "status": "STOP", "equipmentCode": "C101", "equipmentName": "흡착기", "equipmentType": "C1", "displayMeasurements": ["TP-102", "TP-101"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 795, "y": 345}, "selected": false, "positionAbsolute": {"x": 795, "y": 345}}, {"id": "COMMON_1751893525392", "data": {"icon": "settings", "label": "측정기", "status": "STOP", "equipmentCode": "C201", "equipmentName": "측정기", "equipmentType": "C2", "displayMeasurements": ["TS-201"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 795, "y": 675}, "selected": false, "positionAbsolute": {"x": 795, "y": 675}}, {"id": "COMMON_1751893536842", "data": {"icon": "settings", "label": "압축기", "status": "STOP", "equipmentCode": "D101", "equipmentName": "압축기", "equipmentType": "D1", "displayMeasurements": ["PC-101", "TC-101"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 1140, "y": 645}, "selected": true, "positionAbsolute": {"x": 1140, "y": 645}}, {"id": "COMMON_1751893551682", "data": {"icon": "settings", "label": "탱크", "status": "STOP", "equipmentCode": "E101", "equipmentName": "탱크", "equipmentType": "E1", "displayMeasurements": ["LV-101", "PR-101"]}, "type": "equipment", "style": {"width": 200, "height": 270}, "width": 200, "height": 270, "dragging": false, "position": {"x": 1140, "y": 225}, "selected": false, "positionAbsolute": {"x": 1140, "y": 225}}]}', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-07 22:03:46.4851+09', '2025-07-07 22:50:55.02256+09', true, '2025-07-07 22:03:56.799661+09', 'bsABX6EYDssfWSh38WdUvgS_AVKUyCrSoaPOjxIWqPQ', 1, '2881a01f-1eed-4343-b0d1-5d8d22f6744a');
INSERT INTO public.personal_test_process_flows (id, workspace_id, name, flow_data, created_by, created_at, updated_at, is_published, published_at, publish_token, current_version, data_source_id) VALUES ('eed16ebd-efe5-4f5c-be40-5466ff4356a0', '21ee03db-90c4-4592-b00f-c44801e0b164', '샘플공정도2', '{"edges": [{"id": "reactflow__edge-_1751085089714-B1_1751085115749", "type": "smoothstep", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "_1751085089714", "target": "B1_1751085115749", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-_1751085089714-G1_1751085108606", "type": "straight", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "_1751085089714", "target": "G1_1751085108606", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-B1_1751085115749-E1_1751085118930", "type": "default", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "B1_1751085115749", "target": "E1_1751085118930", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-E1_1751085118930-E2_1751085155514", "type": "smoothstep", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "E1_1751085118930", "target": "E2_1751085155514", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-G1_1751085108606-E2_1751085155514", "type": "default", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "G1_1751085108606", "target": "E2_1751085155514", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}], "nodes": [{"id": "_1751085089714", "data": {"icon": "settings", "label": "감압기", "status": "STOP", "equipmentCode": "A101", "equipmentName": "감압기", "equipmentType": "A1", "displayMeasurements": ["TG-001", "TG-002"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": -90, "y": 80}, "selected": false, "positionAbsolute": {"x": -90, "y": 80}}, {"id": "G1_1751085108606", "data": {"icon": "flame", "label": "히터", "status": "STOP", "equipmentCode": "G101", "equipmentName": "히터", "equipmentType": "G1", "displayMeasurements": ["TH-101", "PW-101"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": -90, "y": 450}, "selected": false, "positionAbsolute": {"x": -90, "y": 450}}, {"id": "B1_1751085115749", "data": {"icon": "activity", "label": "차압기", "status": "STOP", "equipmentCode": "B101", "equipmentName": "차압기", "equipmentType": "B1", "displayMeasurements": ["TF-928"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 130, "y": 450}, "selected": false, "positionAbsolute": {"x": 130, "y": 450}}, {"id": "E1_1751085118930", "data": {"icon": "database", "label": "탱크", "status": "STOP", "equipmentCode": "E101", "equipmentName": "탱크", "equipmentType": "E1", "displayMeasurements": ["LV-101"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 350, "y": 800}, "selected": false, "positionAbsolute": {"x": 350, "y": 800}}, {"id": "E2_1751085155514", "data": {"icon": "archive", "label": "저장탱크", "status": "STOP", "equipmentCode": "E201", "equipmentName": "저장탱크", "equipmentType": "E2", "displayMeasurements": []}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 60, "y": 1110}, "selected": true, "positionAbsolute": {"x": 60, "y": 1110}}]}', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-06-28 13:33:13.098548+09', '2025-07-03 21:45:17.906466+09', false, NULL, NULL, 2, '2881a01f-1eed-4343-b0d1-5d8d22f6744a');
INSERT INTO public.personal_test_process_flows (id, workspace_id, name, flow_data, created_by, created_at, updated_at, is_published, published_at, publish_token, current_version, data_source_id) VALUES ('116675b3-43cb-4a93-986b-e6c133204d16', '21ee03db-90c4-4592-b00f-c44801e0b164', '샘플 공정도', '{"edges": [{"id": "reactflow__edge-A1_1751073324228-C2_1751073352895", "type": "step", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "A1_1751073324228", "target": "C2_1751073352895", "animated": false, "selected": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-B1_1751073343571-D2_1751077257073", "type": "step", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "B1_1751073343571", "target": "D2_1751077257073", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-D2_1751083266771-A1_1751083245170", "type": "default", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "D2_1751083266771", "target": "A1_1751083245170", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-B1_1751083289433-A1_1751083312881", "type": "smoothstep", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "B1_1751083289433", "target": "A1_1751083312881", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-D2_1751077257073-E2_1751083457125", "type": "step", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "D2_1751077257073", "target": "E2_1751083457125", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-E2_1751083457125-G1_1751083499986", "type": "straight", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "E2_1751083457125", "target": "G1_1751083499986", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-G1_1751083499986-D1_1751083531907", "type": "smoothstep", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "G1_1751083499986", "target": "D1_1751083531907", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-D1_1751083531907-E1_1751083480473", "type": "default", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "D1_1751083531907", "target": "E1_1751083480473", "animated": false, "selectable": true, "sourceHandle": null, "targetHandle": null}], "nodes": [{"id": "A1_1751073324228", "data": {"icon": "gauge", "label": "감압기", "status": "STOP", "equipmentCode": "A101", "equipmentName": "감압기", "equipmentType": "A1", "displayMeasurements": ["TG-001", "TG-002"]}, "type": "equipment", "style": {"width": 211, "height": 170}, "width": 211, "height": 170, "dragging": false, "position": {"x": 130, "y": 200}, "resizing": false, "selected": false, "positionAbsolute": {"x": 130, "y": 200}}, {"id": "B1_1751073343571", "data": {"icon": "activity", "label": "차압기", "status": "STOP", "equipmentCode": "B101", "equipmentName": "차압기", "equipmentType": "B1", "displayMeasurements": ["TF-928", "TF-929"]}, "type": "equipment", "style": {"width": 208, "height": 170}, "width": 208, "height": 170, "dragging": false, "position": {"x": 360, "y": 200}, "resizing": false, "selected": false, "positionAbsolute": {"x": 360, "y": 200}}, {"id": "C2_1751073352895", "data": {"icon": "thermometer", "label": "측정기", "status": "STOP", "equipmentCode": "C201", "equipmentName": "측정기", "equipmentType": "C2", "displayMeasurements": ["TS-201"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 135.5, "y": 525.6838827115021}, "selected": false, "positionAbsolute": {"x": 135.03774814099847, "y": 525.6838827115021}}, {"id": "D2_1751077257073", "data": {"icon": "zap", "label": "펌프", "status": "STOP", "equipmentCode": "D201", "equipmentName": "펌프", "equipmentType": "D2", "displayMeasurements": ["FL-201"]}, "type": "equipment", "style": {"width": 210, "height": 220}, "width": 210, "height": 220, "dragging": false, "position": {"x": 430, "y": 500}, "resizing": false, "selected": false, "positionAbsolute": {"x": 430, "y": 500}}, {"id": "group_1751077454819", "data": {"color": "#ff8080", "label": "Group"}, "type": "group", "style": {"width": 1276, "height": 808, "zIndex": -1}, "width": 1276, "height": 808, "dragging": false, "position": {"x": 40, "y": 120}, "resizing": false, "selected": false, "positionAbsolute": {"x": 40, "y": 120}}, {"id": "A1_1751083245170", "data": {"icon": "gauge", "label": "감압기", "status": "STOP", "equipmentCode": "A101", "equipmentName": "감압기", "equipmentType": "A1", "displayMeasurements": ["TG-001", "TG-002"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 660, "y": 530}, "selected": false, "positionAbsolute": {"x": 660, "y": 530}}, {"id": "D2_1751083266771", "data": {"icon": "zap", "label": "펌프", "status": "STOP", "equipmentCode": "D201", "equipmentName": "펌프", "equipmentType": "D2", "displayMeasurements": ["FL-201"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 720, "y": 200}, "selected": false, "positionAbsolute": {"x": 720, "y": 200}}, {"id": "B1_1751083289433", "data": {"icon": "activity", "label": "차압기", "status": "STOP", "equipmentCode": "B101", "equipmentName": "차압기", "equipmentType": "B1", "displayMeasurements": ["TF-928", "TF-929"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 930, "y": 200}, "selected": false, "positionAbsolute": {"x": 930, "y": 200}}, {"id": "A1_1751083312881", "data": {"icon": "gauge", "label": "감압기", "status": "STOP", "equipmentCode": "A101", "equipmentName": "감압기", "equipmentType": "A1", "displayMeasurements": ["TG-001", "TG-002"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 1000, "y": 550}, "selected": false, "positionAbsolute": {"x": 1000, "y": 550}}, {"id": "group_1751083444956", "data": {"color": "#3b82f6", "label": "Group"}, "type": "group", "style": {"width": 550, "height": 510, "zIndex": -1}, "width": 550, "height": 510, "dragging": false, "position": {"x": -1370, "y": 480}, "resizing": false, "selected": false, "positionAbsolute": {"x": -1370, "y": 480}}, {"id": "E2_1751083457125", "data": {"icon": "archive", "label": "저장탱크", "status": "STOP", "equipmentCode": "E201", "equipmentName": "저장탱크", "equipmentType": "E2", "displayMeasurements": []}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": -1250, "y": 580}, "selected": false, "positionAbsolute": {"x": -1250, "y": 580}}, {"id": "E1_1751083480473", "data": {"icon": "database", "label": "탱크", "status": "STOP", "equipmentCode": "E101", "equipmentName": "탱크", "equipmentType": "E1", "displayMeasurements": ["LV-101", "PR-101"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 720, "y": 1180}, "selected": false, "positionAbsolute": {"x": 720, "y": 1180}}, {"id": "group_1751083486315", "data": {"color": "#75f09a", "label": "Group"}, "type": "group", "style": {"width": 960, "height": 450, "zIndex": -1}, "width": 960, "height": 450, "dragging": false, "position": {"x": 50, "y": 1080}, "resizing": false, "selected": false, "positionAbsolute": {"x": 50, "y": 1080}}, {"id": "G1_1751083499986", "data": {"icon": "flame", "label": "히터", "status": "STOP", "equipmentCode": "G101", "equipmentName": "히터", "equipmentType": "G1", "displayMeasurements": ["TH-101", "PW-101"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 90, "y": 1170}, "selected": false, "positionAbsolute": {"x": 90, "y": 1170}}, {"id": "D1_1751083531907", "data": {"icon": "wind", "label": "압축기", "status": "STOP", "equipmentCode": "D101", "equipmentName": "압축기", "equipmentType": "D1", "displayMeasurements": ["PC-101", "TC-101"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 400, "y": 1170}, "selected": false, "positionAbsolute": {"x": 400, "y": 1170}}, {"id": "COMMON_1751546846753", "data": {"icon": "settings", "label": "공통설비", "status": "STOP", "equipmentCode": "", "equipmentName": "공통설비", "equipmentType": "COMMON", "displayMeasurements": []}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": -555, "y": 75}, "selected": false, "positionAbsolute": {"x": -555, "y": 75}}, {"id": "text_1751547206517", "data": {"text": "Text", "color": "#000000", "padding": 8, "fontSize": 14, "textAlign": "center", "fontWeight": "normal", "borderColor": "#999999", "borderStyle": "none", "borderWidth": 1, "backgroundColor": "#ffffff"}, "type": "text", "width": 50, "height": 37, "dragging": false, "position": {"x": -315, "y": -15}, "selected": false}, {"id": "text_1751547574665", "data": {"text": "Text", "color": "#000000", "fontSize": 14}, "type": "text", "width": 50, "height": 37, "dragging": false, "position": {"x": 120, "y": -15}, "selected": false}]}', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-06-28 10:18:47.930488+09', '2025-07-03 22:50:03.718103+09', true, '2025-07-01 22:58:01.897738+09', 'WNx2XQ5G3fhM_r8HaJUnGw3z-s9hm-F9ZZ6X3v7GpVQ', 8, '2881a01f-1eed-4343-b0d1-5d8d22f6744a');
INSERT INTO public.personal_test_process_flows (id, workspace_id, name, flow_data, created_by, created_at, updated_at, is_published, published_at, publish_token, current_version, data_source_id) VALUES ('534c9c88-c618-4278-8b17-751e6d52292e', '21ee03db-90c4-4592-b00f-c44801e0b164', 'after_published', '{"edges": [{"id": "reactflow__edge-COMMON_1752105482852-COMMON_1752105509291", "data": {"type": "straight"}, "type": "straight", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1752105482852", "target": "COMMON_1752105509291", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-COMMON_1752105509291-COMMON_1752105530564", "data": {"type": "step"}, "type": "step", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1752105509291", "target": "COMMON_1752105530564", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-COMMON_1752105530564-COMMON_1752105551627", "data": {"type": "smoothstep"}, "type": "smoothstep", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1752105530564", "target": "COMMON_1752105551627", "animated": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-COMMON_1752105551627-COMMON_1752105574099", "data": {"type": "default"}, "type": "default", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1752105551627", "target": "COMMON_1752105574099", "animated": false, "sourceHandle": null, "targetHandle": null}], "nodes": [{"id": "COMMON_1752105482852", "data": {"icon": "settings", "label": "HVAC Unit - Sector 7G", "status": "STOP", "equipmentCode": "HVAC-01", "equipmentName": "HVAC Unit - Sector 7G", "equipmentType": "HVAC", "displayMeasurements": ["P-C03-OUT", "TORQUE-C01", "HUMID-HVAC", "S-002-RPM", "P-002-DIS"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 450, "y": 135}, "selected": false, "positionAbsolute": {"x": 450, "y": 135}}, {"id": "COMMON_1752105509291", "data": {"icon": "settings", "label": "Acid Storage Tank", "status": "STOP", "equipmentCode": "TANK-CHEM-01", "equipmentName": "Acid Storage Tank", "equipmentType": "Tank", "displayMeasurements": ["T-C01-OUT", "DP-F01", "DP-H02", "A-001-CUR"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 450, "y": 465}, "selected": false, "positionAbsolute": {"x": 450, "y": 465}}, {"id": "COMMON_1752105530564", "data": {"icon": "settings", "label": "Auxiliary Feed Pump", "status": "STOP", "equipmentCode": "PUMP-002", "equipmentName": "Auxiliary Feed Pump", "equipmentType": "Pump", "displayMeasurements": ["P-C01-OUT", "FILTER-DP", "V-001-AX", "POS-401", "LEAK-201"]}, "type": "equipment", "style": {"width": 200, "height": 270}, "width": 200, "height": 270, "dragging": false, "position": {"x": 840, "y": 135}, "selected": true, "positionAbsolute": {"x": 840, "y": 135}}, {"id": "COMMON_1752105551627", "data": {"icon": "settings", "label": "Main Conveyor Belt", "status": "STOP", "equipmentCode": "CONV-01", "equipmentName": "Main Conveyor Belt", "equipmentType": "Conveyor", "displayMeasurements": ["POS-401", "POS-R02-X", "ERR-R02"]}, "type": "equipment", "style": {"width": 200, "height": 270}, "width": 200, "height": 270, "dragging": false, "position": {"x": 1035, "y": 510}, "selected": false, "positionAbsolute": {"x": 1035, "y": 510}}, {"id": "COMMON_1752105574099", "data": {"icon": "settings", "label": "Water Intake Filter", "status": "STOP", "equipmentCode": "FILTER-W-01", "equipmentName": "Water Intake Filter", "equipmentType": "Filter", "displayMeasurements": ["LOAD-C01", "TORQUE-C01", "DP-F01", "A-001-CUR", "T-HVAC-SUP", "T-HVAC-RET", "LOAD-M04", "VIB-M03", "TEMP-M03"]}, "type": "equipment", "style": {"width": 200, "height": 270}, "width": 200, "height": 270, "dragging": false, "position": {"x": 705, "y": 900}, "selected": false, "positionAbsolute": {"x": 705, "y": 900}}]}', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-10 09:00:07.428149+09', '2025-07-10 09:16:48.731178+09', false, NULL, NULL, 1, '2881a01f-1eed-4343-b0d1-5d8d22f6744a');
INSERT INTO public.personal_test_process_flows (id, workspace_id, name, flow_data, created_by, created_at, updated_at, is_published, published_at, publish_token, current_version, data_source_id) VALUES ('dc97fea5-ae43-43a2-b681-28b189f1be9a', '21ee03db-90c4-4592-b00f-c44801e0b164', 'New Process Flowas', '{"edges": [{"id": "reactflow__edge-COMMON_1752018879959-COMMON_1752018533071", "data": {"type": "step"}, "type": "step", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1752018879959", "target": "COMMON_1752018533071", "animated": false, "sourceHandle": null, "targetHandle": null}], "nodes": [{"id": "COMMON_1752018533071", "data": {"icon": "settings", "label": "Air Compressor Unit 2", "status": "STOP", "equipmentCode": "COMP-002", "equipmentName": "Air Compressor Unit 2", "equipmentType": "Compressor", "displayMeasurements": ["T-H01-OUT", "DP-H02", "EFF-H02", "T-H02-IN", "T-H02-OUT", "T-HVAC-SUP"]}, "type": "equipment", "style": {"width": 230, "height": 270}, "width": 230, "height": 270, "dragging": false, "position": {"x": 630, "y": 75}, "resizing": false, "selected": false, "positionAbsolute": {"x": 630, "y": 75}}, {"id": "COMMON_1752018879959", "data": {"icon": "settings", "label": "Air Compressor Unit 1", "status": "STOP", "equipmentCode": "COMP-001", "equipmentName": "Air Compressor Unit 1", "equipmentType": "Compressor", "displayMeasurements": ["HOUR-C01"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 360, "y": 75}, "selected": true, "positionAbsolute": {"x": 360, "y": 75}}]}', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-09 08:54:04.764817+09', '2025-07-09 11:53:19.728127+09', true, '2025-07-09 12:19:27.793607+09', '2MgzHQfuKVds9THIcVZWyVE0FQuYg2dW-WOdNJFufMs', 1, '2881a01f-1eed-4343-b0d1-5d8d22f6744a');
INSERT INTO public.personal_test_process_flows (id, workspace_id, name, flow_data, created_by, created_at, updated_at, is_published, published_at, publish_token, current_version, data_source_id) VALUES ('021ddb1d-c70a-454c-bab1-12f949e2c2b1', '21ee03db-90c4-4592-b00f-c44801e0b164', 'new test', '{"edges": [{"id": "reactflow__edge-COMMON_1752031198129-COMMON_1752031241576", "data": {"type": "smoothstep"}, "type": "smoothstep", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1752031198129", "target": "COMMON_1752031241576", "animated": false, "sourceHandle": null, "targetHandle": null}], "nodes": [{"id": "COMMON_1752031198129", "data": {"icon": "settings", "label": "Main Exhaust Fan", "status": "STOP", "equipmentCode": "FAN-EX-01", "equipmentName": "Main Exhaust Fan", "equipmentType": "Fan", "displayMeasurements": ["T-H01-OUT", "DP-H02", "T-H02-IN", "SPD-R01", "POS-201"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 600, "y": 105}, "selected": false, "positionAbsolute": {"x": 600, "y": 105}}, {"id": "COMMON_1752031241576", "data": {"icon": "settings", "label": "Ventilation Fan Motor", "status": "STOP", "equipmentCode": "MOTOR-002", "equipmentName": "Ventilation Fan Motor", "equipmentType": "Motor", "displayMeasurements": ["AMP-F01", "T-HVAC-SUP", "POS-R02-X", "POS-401"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 870, "y": 435}, "selected": true, "positionAbsolute": {"x": 870, "y": 435}}]}', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-09 12:21:04.820071+09', '2025-07-09 13:42:32.316505+09', true, '2025-07-09 12:21:08.69472+09', 'zNEL6ZVg-JUy5jzJhVDyrocK2ETiKFaud30bRBbVlKE', 1, '2881a01f-1eed-4343-b0d1-5d8d22f6744a');
INSERT INTO public.personal_test_process_flows (id, workspace_id, name, flow_data, created_by, created_at, updated_at, is_published, published_at, publish_token, current_version, data_source_id) VALUES ('44254471-ea40-4866-9330-6012406e8cff', '21ee03db-90c4-4592-b00f-c44801e0b164', 'nt', '{"edges": [{"id": "reactflow__edge-COMMON_1752036246531-COMMON_1752036259739", "data": {"type": "step"}, "type": "step", "style": {"stroke": "#374151", "strokeWidth": 2}, "source": "COMMON_1752036246531", "target": "COMMON_1752036259739", "animated": false, "sourceHandle": null, "targetHandle": null}], "nodes": [{"id": "COMMON_1752036246531", "data": {"icon": "settings", "label": "Primary Heat Exchanger", "status": "STOP", "equipmentCode": "HEATEX-01", "equipmentName": "Primary Heat Exchanger", "equipmentType": "HeatExchanger", "displayMeasurements": ["HOUR-C01", "LOAD-C01", "FREQ-G01"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 765, "y": 120}, "selected": false, "positionAbsolute": {"x": 765, "y": 120}}, {"id": "COMMON_1752036259739", "data": {"icon": "settings", "label": "Tank Level Sensor", "status": "STOP", "equipmentCode": "SENSOR-L-01", "equipmentName": "Tank Level Sensor", "equipmentType": "Sensor", "displayMeasurements": ["P-C01-OUT", "T-004-MOT", "PRES-S01", "SPD-C01"]}, "type": "equipment", "style": {"width": 200, "height": 270}, "width": 200, "height": 270, "dragging": false, "position": {"x": 1080, "y": 90}, "selected": true, "positionAbsolute": {"x": 1080, "y": 90}}]}', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-09 13:44:40.606627+09', '2025-07-10 08:39:00.393476+09', true, '2025-07-09 15:16:48.055346+09', 'zK62ELnYQtkw7lm4yoQAjk94DzdfACWhhGR-db86oto', 1, '2881a01f-1eed-4343-b0d1-5d8d22f6744a');


--
-- TOC entry 5129 (class 0 OID 20182)
-- Dependencies: 238
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
-- TOC entry 5125 (class 0 OID 19974)
-- Dependencies: 234
-- Data for Name: workspace_files; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.workspace_files (id, workspace_id, parent_id, name, original_name, file_path, file_size, mime_type, file_hash, is_directory, file_extension, file_metadata, description, is_deleted, is_public, version, version_of, uploaded_by, uploaded_at, modified_by, modified_at) VALUES ('6c391a49-88d1-402b-b64f-bfdcd1f45c93', '21ee03db-90c4-4592-b00f-c44801e0b164', NULL, 'test2', 'test2', '/', 0, 'inode/directory', NULL, true, NULL, '{}', NULL, false, false, 1, NULL, '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-06-26 22:40:49.602836+09', NULL, NULL);


--
-- TOC entry 5126 (class 0 OID 19980)
-- Dependencies: 235
-- Data for Name: workspace_groups; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.workspace_groups (id, workspace_id, group_name, group_display_name, permission_level, created_by, created_at) VALUES ('7b02d9cd-d1a4-4978-a3c3-fa9084ebe1fe', '21ee03db-90c4-4592-b00f-c44801e0b164', '개발팀', NULL, 'read', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-06-29 21:42:46.16532+09');


--
-- TOC entry 5127 (class 0 OID 19986)
-- Dependencies: 236
-- Data for Name: workspace_users; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.workspace_users (id, workspace_id, user_id, user_display_name, permission_level, created_by, created_at) VALUES ('cee60cf8-ce9c-4fa4-8a50-94f19f2f1161', '21ee03db-90c4-4592-b00f-c44801e0b164', 'admin@test.com', NULL, 'admin', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-06-29 21:39:06.684358+09');
INSERT INTO public.workspace_users (id, workspace_id, user_id, user_display_name, permission_level, created_by, created_at) VALUES ('e612d5f8-93e2-4f45-b298-4d1f779bc0ff', '594c3e96-8261-405a-8df2-cf2ccc4062d9', 'admin@test.com', NULL, 'read', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-01 23:00:36.291733+09');


--
-- TOC entry 5128 (class 0 OID 19992)
-- Dependencies: 237
-- Data for Name: workspaces; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.workspaces (id, name, slug, description, is_active, settings, created_by, updated_by, created_at, updated_at, workspace_type, owner_type, owner_id, parent_id, path, is_folder) VALUES ('594c3e96-8261-405a-8df2-cf2ccc4062d9', 'ProductionManagement', 'productionmanagement', '', true, '{}', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-01 23:00:36.291733+09', NULL, 'PERSONAL', 'USER', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', NULL, '/', false);
INSERT INTO public.workspaces (id, name, slug, description, is_active, settings, created_by, updated_by, created_at, updated_at, workspace_type, owner_type, owner_id, parent_id, path, is_folder) VALUES ('21ee03db-90c4-4592-b00f-c44801e0b164', 'Chemical_Iksan_AI_Infrapart', 'personaltest', '', true, '{}', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-06-26 22:33:54.447636+09', '2025-07-07 22:07:59.031408+09', 'PERSONAL', 'USER', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', NULL, '/', false);
INSERT INTO public.workspaces (id, name, slug, description, is_active, settings, created_by, updated_by, created_at, updated_at, workspace_type, owner_type, owner_id, parent_id, path, is_folder) VALUES ('4b624c81-1ab5-4c29-90aa-024a8bb034fe', 'for_is_ch', 'forisch', '', false, '{}', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-06-29 00:05:16.065726+09', '2025-07-07 22:08:24.38692+09', 'GROUP', 'GROUP', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', NULL, '/', false);


--
-- TOC entry 5203 (class 0 OID 0)
-- Dependencies: 229
-- Name: personal_test_measurement_data_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.personal_test_measurement_data_id_seq', 20, true);


--
-- TOC entry 4842 (class 2606 OID 20013)
-- Name: alembic_version alembic_version_pkc; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.alembic_version
    ADD CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num);


--
-- TOC entry 4844 (class 2606 OID 20015)
-- Name: api_endpoint_mappings api_endpoint_mappings_config_id_data_type_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.api_endpoint_mappings
    ADD CONSTRAINT api_endpoint_mappings_config_id_data_type_key UNIQUE (config_id, data_type);


--
-- TOC entry 4846 (class 2606 OID 20017)
-- Name: api_endpoint_mappings api_endpoint_mappings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.api_endpoint_mappings
    ADD CONSTRAINT api_endpoint_mappings_pkey PRIMARY KEY (id);


--
-- TOC entry 4849 (class 2606 OID 20019)
-- Name: data_source_configs data_source_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.data_source_configs
    ADD CONSTRAINT data_source_configs_pkey PRIMARY KEY (id);


--
-- TOC entry 4851 (class 2606 OID 20021)
-- Name: data_source_configs data_source_configs_workspace_id_config_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.data_source_configs
    ADD CONSTRAINT data_source_configs_workspace_id_config_name_key UNIQUE (workspace_id, config_name);


--
-- TOC entry 4854 (class 2606 OID 20023)
-- Name: data_source_endpoint_mappings data_source_endpoint_mappings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.data_source_endpoint_mappings
    ADD CONSTRAINT data_source_endpoint_mappings_pkey PRIMARY KEY (id);


--
-- TOC entry 4858 (class 2606 OID 20025)
-- Name: data_source_field_mappings data_source_field_mappings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.data_source_field_mappings
    ADD CONSTRAINT data_source_field_mappings_pkey PRIMARY KEY (id);


--
-- TOC entry 4862 (class 2606 OID 20027)
-- Name: data_source_mappings data_source_mappings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.data_source_mappings
    ADD CONSTRAINT data_source_mappings_pkey PRIMARY KEY (id);


--
-- TOC entry 4866 (class 2606 OID 20029)
-- Name: file_shares file_shares_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.file_shares
    ADD CONSTRAINT file_shares_pkey PRIMARY KEY (id);


--
-- TOC entry 4868 (class 2606 OID 20031)
-- Name: file_shares file_shares_share_token_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.file_shares
    ADD CONSTRAINT file_shares_share_token_key UNIQUE (share_token);


--
-- TOC entry 4875 (class 2606 OID 20033)
-- Name: measurement_specs measurement_specs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.measurement_specs
    ADD CONSTRAINT measurement_specs_pkey PRIMARY KEY (measurement_code);


--
-- TOC entry 4881 (class 2606 OID 20035)
-- Name: mvp_module_logs mvp_module_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.mvp_module_logs
    ADD CONSTRAINT mvp_module_logs_pkey PRIMARY KEY (id);


--
-- TOC entry 4889 (class 2606 OID 20037)
-- Name: mvp_modules mvp_modules_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.mvp_modules
    ADD CONSTRAINT mvp_modules_pkey PRIMARY KEY (id);


--
-- TOC entry 4892 (class 2606 OID 20039)
-- Name: personal_test_equipment_status personal_test_equipment_status_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.personal_test_equipment_status
    ADD CONSTRAINT personal_test_equipment_status_pkey PRIMARY KEY (equipment_code);


--
-- TOC entry 4896 (class 2606 OID 20041)
-- Name: personal_test_measurement_data personal_test_measurement_data_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.personal_test_measurement_data
    ADD CONSTRAINT personal_test_measurement_data_pkey PRIMARY KEY (id);


--
-- TOC entry 4901 (class 2606 OID 20043)
-- Name: personal_test_process_flow_versions personal_test_process_flow_versions_flow_id_version_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.personal_test_process_flow_versions
    ADD CONSTRAINT personal_test_process_flow_versions_flow_id_version_number_key UNIQUE (flow_id, version_number);


--
-- TOC entry 4903 (class 2606 OID 20045)
-- Name: personal_test_process_flow_versions personal_test_process_flow_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.personal_test_process_flow_versions
    ADD CONSTRAINT personal_test_process_flow_versions_pkey PRIMARY KEY (id);


--
-- TOC entry 4905 (class 2606 OID 20047)
-- Name: personal_test_process_flow_versions personal_test_process_flow_versions_publish_token_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.personal_test_process_flow_versions
    ADD CONSTRAINT personal_test_process_flow_versions_publish_token_key UNIQUE (publish_token);


--
-- TOC entry 4911 (class 2606 OID 20049)
-- Name: personal_test_process_flows personal_test_process_flows_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.personal_test_process_flows
    ADD CONSTRAINT personal_test_process_flows_pkey PRIMARY KEY (id);


--
-- TOC entry 4913 (class 2606 OID 20051)
-- Name: personal_test_process_flows personal_test_process_flows_publish_token_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.personal_test_process_flows
    ADD CONSTRAINT personal_test_process_flows_publish_token_key UNIQUE (publish_token);


--
-- TOC entry 4948 (class 2606 OID 20191)
-- Name: status_mappings status_mappings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.status_mappings
    ADD CONSTRAINT status_mappings_pkey PRIMARY KEY (id);


--
-- TOC entry 4860 (class 2606 OID 20053)
-- Name: data_source_field_mappings unique_field_mapping; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.data_source_field_mappings
    ADD CONSTRAINT unique_field_mapping UNIQUE (data_source_id, data_type, target_field);


--
-- TOC entry 4864 (class 2606 OID 20055)
-- Name: data_source_mappings unique_mapping; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.data_source_mappings
    ADD CONSTRAINT unique_mapping UNIQUE (workspace_id, data_source_id, mapping_type, source_code);


--
-- TOC entry 4856 (class 2606 OID 20057)
-- Name: data_source_endpoint_mappings unique_source_type; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.data_source_endpoint_mappings
    ADD CONSTRAINT unique_source_type UNIQUE (data_source_id, data_type);


--
-- TOC entry 4950 (class 2606 OID 20193)
-- Name: status_mappings unique_workspace_source_datasource; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.status_mappings
    ADD CONSTRAINT unique_workspace_source_datasource UNIQUE (workspace_id, source_status, data_source_type);


--
-- TOC entry 4923 (class 2606 OID 20059)
-- Name: workspace_files workspace_files_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workspace_files
    ADD CONSTRAINT workspace_files_pkey PRIMARY KEY (id);


--
-- TOC entry 4930 (class 2606 OID 20061)
-- Name: workspace_groups workspace_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workspace_groups
    ADD CONSTRAINT workspace_groups_pkey PRIMARY KEY (id);


--
-- TOC entry 4937 (class 2606 OID 20063)
-- Name: workspace_users workspace_users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workspace_users
    ADD CONSTRAINT workspace_users_pkey PRIMARY KEY (id);


--
-- TOC entry 4945 (class 2606 OID 20065)
-- Name: workspaces workspaces_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workspaces
    ADD CONSTRAINT workspaces_pkey PRIMARY KEY (id);


--
-- TOC entry 4847 (class 1259 OID 20066)
-- Name: idx_api_endpoint_mappings_config; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_api_endpoint_mappings_config ON public.api_endpoint_mappings USING btree (config_id, data_type);


--
-- TOC entry 4852 (class 1259 OID 20067)
-- Name: idx_data_source_configs_workspace; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_data_source_configs_workspace ON public.data_source_configs USING btree (workspace_id, is_active);


--
-- TOC entry 4869 (class 1259 OID 20068)
-- Name: idx_file_share_expires; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_file_share_expires ON public.file_shares USING btree (expires_at);


--
-- TOC entry 4870 (class 1259 OID 20069)
-- Name: idx_file_share_file; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_file_share_file ON public.file_shares USING btree (file_id);


--
-- TOC entry 4871 (class 1259 OID 20070)
-- Name: idx_file_share_token; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_file_share_token ON public.file_shares USING btree (share_token);


--
-- TOC entry 4897 (class 1259 OID 20071)
-- Name: idx_flow_versions_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_flow_versions_created_at ON public.personal_test_process_flow_versions USING btree (created_at);


--
-- TOC entry 4898 (class 1259 OID 20072)
-- Name: idx_flow_versions_flow_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_flow_versions_flow_id ON public.personal_test_process_flow_versions USING btree (flow_id);


--
-- TOC entry 4899 (class 1259 OID 20073)
-- Name: idx_flow_versions_published; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_flow_versions_published ON public.personal_test_process_flow_versions USING btree (is_published) WHERE (is_published = true);


--
-- TOC entry 4873 (class 1259 OID 20074)
-- Name: idx_measurement_specs_code; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_measurement_specs_code ON public.measurement_specs USING btree (measurement_code);


--
-- TOC entry 4882 (class 1259 OID 20075)
-- Name: idx_mvp_module_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_mvp_module_active ON public.mvp_modules USING btree (is_active);


--
-- TOC entry 4883 (class 1259 OID 20076)
-- Name: idx_mvp_module_installed; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_mvp_module_installed ON public.mvp_modules USING btree (is_installed);


--
-- TOC entry 4876 (class 1259 OID 20077)
-- Name: idx_mvp_module_log_action; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_mvp_module_log_action ON public.mvp_module_logs USING btree (action);


--
-- TOC entry 4877 (class 1259 OID 20078)
-- Name: idx_mvp_module_log_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_mvp_module_log_created_at ON public.mvp_module_logs USING btree (created_at);


--
-- TOC entry 4878 (class 1259 OID 20079)
-- Name: idx_mvp_module_log_module; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_mvp_module_log_module ON public.mvp_module_logs USING btree (module_id);


--
-- TOC entry 4884 (class 1259 OID 20080)
-- Name: idx_mvp_module_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_mvp_module_name ON public.mvp_modules USING btree (module_name);


--
-- TOC entry 4885 (class 1259 OID 20081)
-- Name: idx_mvp_module_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_mvp_module_unique ON public.mvp_modules USING btree (workspace_id, module_name);


--
-- TOC entry 4886 (class 1259 OID 20082)
-- Name: idx_mvp_module_workspace; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_mvp_module_workspace ON public.mvp_modules USING btree (workspace_id);


--
-- TOC entry 4890 (class 1259 OID 20083)
-- Name: idx_personal_test_equipment_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_personal_test_equipment_status ON public.personal_test_equipment_status USING btree (equipment_type, status);


--
-- TOC entry 4906 (class 1259 OID 20084)
-- Name: idx_personal_test_flows_publish_token; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_personal_test_flows_publish_token ON public.personal_test_process_flows USING btree (publish_token) WHERE (is_published = true);


--
-- TOC entry 4907 (class 1259 OID 20085)
-- Name: idx_personal_test_flows_published; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_personal_test_flows_published ON public.personal_test_process_flows USING btree (is_published, published_at DESC) WHERE (is_published = true);


--
-- TOC entry 4908 (class 1259 OID 20086)
-- Name: idx_personal_test_flows_updated; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_personal_test_flows_updated ON public.personal_test_process_flows USING btree (updated_at DESC);


--
-- TOC entry 4909 (class 1259 OID 20087)
-- Name: idx_personal_test_flows_workspace; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_personal_test_flows_workspace ON public.personal_test_process_flows USING btree (workspace_id);


--
-- TOC entry 4893 (class 1259 OID 20088)
-- Name: idx_personal_test_measurements_equipment; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_personal_test_measurements_equipment ON public.personal_test_measurement_data USING btree (equipment_code, "timestamp" DESC);


--
-- TOC entry 4894 (class 1259 OID 20089)
-- Name: idx_personal_test_measurements_time; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_personal_test_measurements_time ON public.personal_test_measurement_data USING btree ("timestamp" DESC);


--
-- TOC entry 4946 (class 1259 OID 20194)
-- Name: idx_status_mappings_workspace_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_status_mappings_workspace_active ON public.status_mappings USING btree (workspace_id, is_active);


--
-- TOC entry 4938 (class 1259 OID 20090)
-- Name: idx_workspace_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_workspace_active ON public.workspaces USING btree (is_active);


--
-- TOC entry 4939 (class 1259 OID 20091)
-- Name: idx_workspace_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_workspace_created_at ON public.workspaces USING btree (created_at);


--
-- TOC entry 4940 (class 1259 OID 20092)
-- Name: idx_workspace_created_by; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_workspace_created_by ON public.workspaces USING btree (created_by);


--
-- TOC entry 4914 (class 1259 OID 20093)
-- Name: idx_workspace_file_is_deleted; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_workspace_file_is_deleted ON public.workspace_files USING btree (is_deleted);


--
-- TOC entry 4915 (class 1259 OID 20094)
-- Name: idx_workspace_file_mime_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_workspace_file_mime_type ON public.workspace_files USING btree (mime_type);


--
-- TOC entry 4916 (class 1259 OID 20095)
-- Name: idx_workspace_file_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_workspace_file_name ON public.workspace_files USING btree (name);


--
-- TOC entry 4917 (class 1259 OID 20096)
-- Name: idx_workspace_file_parent; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_workspace_file_parent ON public.workspace_files USING btree (parent_id);


--
-- TOC entry 4918 (class 1259 OID 20097)
-- Name: idx_workspace_file_uploaded_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_workspace_file_uploaded_at ON public.workspace_files USING btree (uploaded_at);


--
-- TOC entry 4919 (class 1259 OID 20098)
-- Name: idx_workspace_file_version_of; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_workspace_file_version_of ON public.workspace_files USING btree (version_of);


--
-- TOC entry 4920 (class 1259 OID 20099)
-- Name: idx_workspace_file_workspace; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_workspace_file_workspace ON public.workspace_files USING btree (workspace_id);


--
-- TOC entry 4924 (class 1259 OID 20100)
-- Name: idx_workspace_group_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_workspace_group_name ON public.workspace_groups USING btree (group_name);


--
-- TOC entry 4925 (class 1259 OID 20101)
-- Name: idx_workspace_group_permission; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_workspace_group_permission ON public.workspace_groups USING btree (permission_level);


--
-- TOC entry 4926 (class 1259 OID 20102)
-- Name: idx_workspace_group_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_workspace_group_unique ON public.workspace_groups USING btree (workspace_id, group_name);


--
-- TOC entry 4927 (class 1259 OID 20103)
-- Name: idx_workspace_group_workspace; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_workspace_group_workspace ON public.workspace_groups USING btree (workspace_id);


--
-- TOC entry 4931 (class 1259 OID 20104)
-- Name: idx_workspace_user_permission; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_workspace_user_permission ON public.workspace_users USING btree (permission_level);


--
-- TOC entry 4932 (class 1259 OID 20105)
-- Name: idx_workspace_user_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_workspace_user_unique ON public.workspace_users USING btree (workspace_id, user_id);


--
-- TOC entry 4933 (class 1259 OID 20106)
-- Name: idx_workspace_user_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_workspace_user_user ON public.workspace_users USING btree (user_id);


--
-- TOC entry 4934 (class 1259 OID 20107)
-- Name: idx_workspace_user_workspace; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_workspace_user_workspace ON public.workspace_users USING btree (workspace_id);


--
-- TOC entry 4872 (class 1259 OID 20108)
-- Name: ix_file_shares_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_file_shares_id ON public.file_shares USING btree (id);


--
-- TOC entry 4879 (class 1259 OID 20109)
-- Name: ix_mvp_module_logs_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_mvp_module_logs_id ON public.mvp_module_logs USING btree (id);


--
-- TOC entry 4887 (class 1259 OID 20110)
-- Name: ix_mvp_modules_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_mvp_modules_id ON public.mvp_modules USING btree (id);


--
-- TOC entry 4921 (class 1259 OID 20111)
-- Name: ix_workspace_files_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_workspace_files_id ON public.workspace_files USING btree (id);


--
-- TOC entry 4928 (class 1259 OID 20112)
-- Name: ix_workspace_groups_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_workspace_groups_id ON public.workspace_groups USING btree (id);


--
-- TOC entry 4935 (class 1259 OID 20113)
-- Name: ix_workspace_users_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_workspace_users_id ON public.workspace_users USING btree (id);


--
-- TOC entry 4941 (class 1259 OID 20114)
-- Name: ix_workspaces_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_workspaces_id ON public.workspaces USING btree (id);


--
-- TOC entry 4942 (class 1259 OID 20115)
-- Name: ix_workspaces_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_workspaces_name ON public.workspaces USING btree (name);


--
-- TOC entry 4943 (class 1259 OID 20116)
-- Name: ix_workspaces_slug; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX ix_workspaces_slug ON public.workspaces USING btree (slug);


--
-- TOC entry 4951 (class 2606 OID 20117)
-- Name: api_endpoint_mappings api_endpoint_mappings_config_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.api_endpoint_mappings
    ADD CONSTRAINT api_endpoint_mappings_config_id_fkey FOREIGN KEY (config_id) REFERENCES public.data_source_configs(id) ON DELETE CASCADE;


--
-- TOC entry 4952 (class 2606 OID 20122)
-- Name: file_shares file_shares_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.file_shares
    ADD CONSTRAINT file_shares_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.workspace_files(id) ON DELETE CASCADE;


--
-- TOC entry 4953 (class 2606 OID 20127)
-- Name: mvp_module_logs mvp_module_logs_module_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.mvp_module_logs
    ADD CONSTRAINT mvp_module_logs_module_id_fkey FOREIGN KEY (module_id) REFERENCES public.mvp_modules(id) ON DELETE CASCADE;


--
-- TOC entry 4954 (class 2606 OID 20132)
-- Name: mvp_modules mvp_modules_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.mvp_modules
    ADD CONSTRAINT mvp_modules_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- TOC entry 4955 (class 2606 OID 20137)
-- Name: personal_test_measurement_data personal_test_measurement_data_equipment_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.personal_test_measurement_data
    ADD CONSTRAINT personal_test_measurement_data_equipment_code_fkey FOREIGN KEY (equipment_code) REFERENCES public.personal_test_equipment_status(equipment_code);


--
-- TOC entry 4956 (class 2606 OID 20142)
-- Name: personal_test_process_flow_versions personal_test_process_flow_versions_flow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.personal_test_process_flow_versions
    ADD CONSTRAINT personal_test_process_flow_versions_flow_id_fkey FOREIGN KEY (flow_id) REFERENCES public.personal_test_process_flows(id) ON DELETE CASCADE;


--
-- TOC entry 4957 (class 2606 OID 20147)
-- Name: workspace_files workspace_files_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workspace_files
    ADD CONSTRAINT workspace_files_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.workspace_files(id) ON DELETE CASCADE;


--
-- TOC entry 4958 (class 2606 OID 20152)
-- Name: workspace_files workspace_files_version_of_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workspace_files
    ADD CONSTRAINT workspace_files_version_of_fkey FOREIGN KEY (version_of) REFERENCES public.workspace_files(id);


--
-- TOC entry 4959 (class 2606 OID 20157)
-- Name: workspace_files workspace_files_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workspace_files
    ADD CONSTRAINT workspace_files_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- TOC entry 4960 (class 2606 OID 20162)
-- Name: workspace_groups workspace_groups_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workspace_groups
    ADD CONSTRAINT workspace_groups_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- TOC entry 4961 (class 2606 OID 20167)
-- Name: workspace_users workspace_users_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workspace_users
    ADD CONSTRAINT workspace_users_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- TOC entry 4962 (class 2606 OID 20172)
-- Name: workspaces workspaces_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workspaces
    ADD CONSTRAINT workspaces_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


-- Completed on 2025-07-10 10:01:01

--
-- PostgreSQL database dump complete
--

