--
-- PostgreSQL database dump
--

-- Dumped from database version 17.5
-- Dumped by pg_dump version 17.5

-- Started on 2025-07-02 06:24:29 KST

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
-- TOC entry 875 (class 1247 OID 19674)
-- Name: ownertype; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.ownertype AS ENUM (
    'USER',
    'GROUP'
);


ALTER TYPE public.ownertype OWNER TO postgres;

--
-- TOC entry 872 (class 1247 OID 19669)
-- Name: workspacetype; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.workspacetype AS ENUM (
    'PERSONAL',
    'GROUP'
);


ALTER TYPE public.workspacetype OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 217 (class 1259 OID 19593)
-- Name: alembic_version; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.alembic_version (
    version_num character varying(32) NOT NULL
);


ALTER TABLE public.alembic_version OWNER TO postgres;

--
-- TOC entry 223 (class 1259 OID 19712)
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
-- TOC entry 3760 (class 0 OID 0)
-- Dependencies: 223
-- Name: COLUMN file_shares.share_token; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.file_shares.share_token IS '공유 토큰';


--
-- TOC entry 3761 (class 0 OID 0)
-- Dependencies: 223
-- Name: COLUMN file_shares.share_type; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.file_shares.share_type IS '공유 타입 (view/download)';


--
-- TOC entry 3762 (class 0 OID 0)
-- Dependencies: 223
-- Name: COLUMN file_shares.password; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.file_shares.password IS '비밀번호 (해시)';


--
-- TOC entry 3763 (class 0 OID 0)
-- Dependencies: 223
-- Name: COLUMN file_shares.expires_at; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.file_shares.expires_at IS '만료일시';


--
-- TOC entry 3764 (class 0 OID 0)
-- Dependencies: 223
-- Name: COLUMN file_shares.max_downloads; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.file_shares.max_downloads IS '최대 다운로드 횟수';


--
-- TOC entry 3765 (class 0 OID 0)
-- Dependencies: 223
-- Name: COLUMN file_shares.download_count; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.file_shares.download_count IS '다운로드 횟수';


--
-- TOC entry 3766 (class 0 OID 0)
-- Dependencies: 223
-- Name: COLUMN file_shares.created_by; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.file_shares.created_by IS '생성자';


--
-- TOC entry 3767 (class 0 OID 0)
-- Dependencies: 223
-- Name: COLUMN file_shares.created_at; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.file_shares.created_at IS '생성일시';


--
-- TOC entry 3768 (class 0 OID 0)
-- Dependencies: 223
-- Name: COLUMN file_shares.last_accessed_at; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.file_shares.last_accessed_at IS '마지막 접근일시';


--
-- TOC entry 221 (class 1259 OID 19649)
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
-- TOC entry 3769 (class 0 OID 0)
-- Dependencies: 221
-- Name: COLUMN mvp_module_logs.action; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.mvp_module_logs.action IS '액션 타입 (install/uninstall/activate/deactivate/configure)';


--
-- TOC entry 3770 (class 0 OID 0)
-- Dependencies: 221
-- Name: COLUMN mvp_module_logs.message; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.mvp_module_logs.message IS '로그 메시지';


--
-- TOC entry 3771 (class 0 OID 0)
-- Dependencies: 221
-- Name: COLUMN mvp_module_logs.details; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.mvp_module_logs.details IS '상세 정보 JSON';


--
-- TOC entry 3772 (class 0 OID 0)
-- Dependencies: 221
-- Name: COLUMN mvp_module_logs.created_by; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.mvp_module_logs.created_by IS '액션 수행자';


--
-- TOC entry 3773 (class 0 OID 0)
-- Dependencies: 221
-- Name: COLUMN mvp_module_logs.created_at; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.mvp_module_logs.created_at IS '생성일시';


--
-- TOC entry 219 (class 1259 OID 19612)
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
-- TOC entry 3774 (class 0 OID 0)
-- Dependencies: 219
-- Name: COLUMN mvp_modules.module_name; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.mvp_modules.module_name IS '모듈명 (파이썬 모듈명)';


--
-- TOC entry 3775 (class 0 OID 0)
-- Dependencies: 219
-- Name: COLUMN mvp_modules.display_name; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.mvp_modules.display_name IS '표시명';


--
-- TOC entry 3776 (class 0 OID 0)
-- Dependencies: 219
-- Name: COLUMN mvp_modules.description; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.mvp_modules.description IS '모듈 설명';


--
-- TOC entry 3777 (class 0 OID 0)
-- Dependencies: 219
-- Name: COLUMN mvp_modules.version; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.mvp_modules.version IS '모듈 버전';


--
-- TOC entry 3778 (class 0 OID 0)
-- Dependencies: 219
-- Name: COLUMN mvp_modules.is_active; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.mvp_modules.is_active IS '활성화 상태';


--
-- TOC entry 3779 (class 0 OID 0)
-- Dependencies: 219
-- Name: COLUMN mvp_modules.is_installed; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.mvp_modules.is_installed IS '설치 상태';


--
-- TOC entry 3780 (class 0 OID 0)
-- Dependencies: 219
-- Name: COLUMN mvp_modules.config; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.mvp_modules.config IS '모듈 설정 JSON';


--
-- TOC entry 3781 (class 0 OID 0)
-- Dependencies: 219
-- Name: COLUMN mvp_modules.sort_order; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.mvp_modules.sort_order IS '정렬 순서';


--
-- TOC entry 3782 (class 0 OID 0)
-- Dependencies: 219
-- Name: COLUMN mvp_modules.icon; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.mvp_modules.icon IS '아이콘';


--
-- TOC entry 3783 (class 0 OID 0)
-- Dependencies: 219
-- Name: COLUMN mvp_modules.color; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.mvp_modules.color IS '테마 색상';


--
-- TOC entry 3784 (class 0 OID 0)
-- Dependencies: 219
-- Name: COLUMN mvp_modules.created_by; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.mvp_modules.created_by IS '생성자';


--
-- TOC entry 3785 (class 0 OID 0)
-- Dependencies: 219
-- Name: COLUMN mvp_modules.updated_by; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.mvp_modules.updated_by IS '최종 수정자';


--
-- TOC entry 3786 (class 0 OID 0)
-- Dependencies: 219
-- Name: COLUMN mvp_modules.created_at; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.mvp_modules.created_at IS '생성일시';


--
-- TOC entry 3787 (class 0 OID 0)
-- Dependencies: 219
-- Name: COLUMN mvp_modules.updated_at; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.mvp_modules.updated_at IS '수정일시';


--
-- TOC entry 225 (class 1259 OID 19768)
-- Name: personal_test_equipment_status; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.personal_test_equipment_status (
    equipment_type character varying(20) NOT NULL,
    equipment_code character varying(30) NOT NULL,
    equipment_name character varying(50) NOT NULL,
    status character varying(20) NOT NULL,
    last_run_time timestamp with time zone,
    CONSTRAINT personal_test_equipment_status_status_check CHECK (((status)::text = ANY ((ARRAY['ACTIVE'::character varying, 'PAUSE'::character varying, 'STOP'::character varying])::text[])))
);


ALTER TABLE public.personal_test_equipment_status OWNER TO postgres;

--
-- TOC entry 227 (class 1259 OID 19775)
-- Name: personal_test_measurement_data; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.personal_test_measurement_data (
    id integer NOT NULL,
    equipment_type character varying(20) NOT NULL,
    equipment_code character varying(30) NOT NULL,
    measurement_code character varying(30) NOT NULL,
    measurement_desc character varying(100) NOT NULL,
    measurement_value numeric(20,3) NOT NULL,
    "timestamp" timestamp with time zone DEFAULT now()
);


ALTER TABLE public.personal_test_measurement_data OWNER TO postgres;

--
-- TOC entry 226 (class 1259 OID 19774)
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
-- TOC entry 3788 (class 0 OID 0)
-- Dependencies: 226
-- Name: personal_test_measurement_data_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.personal_test_measurement_data_id_seq OWNED BY public.personal_test_measurement_data.id;


--
-- TOC entry 224 (class 1259 OID 19758)
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
    publish_token character varying(255)
);


ALTER TABLE public.personal_test_process_flows OWNER TO postgres;

--
-- TOC entry 222 (class 1259 OID 19681)
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
-- TOC entry 3789 (class 0 OID 0)
-- Dependencies: 222
-- Name: COLUMN workspace_files.name; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_files.name IS '파일명';


--
-- TOC entry 3790 (class 0 OID 0)
-- Dependencies: 222
-- Name: COLUMN workspace_files.original_name; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_files.original_name IS '원본 파일명';


--
-- TOC entry 3791 (class 0 OID 0)
-- Dependencies: 222
-- Name: COLUMN workspace_files.file_path; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_files.file_path IS '저장 경로';


--
-- TOC entry 3792 (class 0 OID 0)
-- Dependencies: 222
-- Name: COLUMN workspace_files.file_size; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_files.file_size IS '파일 크기 (bytes)';


--
-- TOC entry 3793 (class 0 OID 0)
-- Dependencies: 222
-- Name: COLUMN workspace_files.mime_type; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_files.mime_type IS 'MIME 타입';


--
-- TOC entry 3794 (class 0 OID 0)
-- Dependencies: 222
-- Name: COLUMN workspace_files.file_hash; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_files.file_hash IS '파일 해시 (SHA256)';


--
-- TOC entry 3795 (class 0 OID 0)
-- Dependencies: 222
-- Name: COLUMN workspace_files.is_directory; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_files.is_directory IS '디렉토리 여부';


--
-- TOC entry 3796 (class 0 OID 0)
-- Dependencies: 222
-- Name: COLUMN workspace_files.file_extension; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_files.file_extension IS '파일 확장자';


--
-- TOC entry 3797 (class 0 OID 0)
-- Dependencies: 222
-- Name: COLUMN workspace_files.file_metadata; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_files.file_metadata IS '파일 메타데이터';


--
-- TOC entry 3798 (class 0 OID 0)
-- Dependencies: 222
-- Name: COLUMN workspace_files.description; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_files.description IS '파일 설명';


--
-- TOC entry 3799 (class 0 OID 0)
-- Dependencies: 222
-- Name: COLUMN workspace_files.is_deleted; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_files.is_deleted IS '삭제 상태';


--
-- TOC entry 3800 (class 0 OID 0)
-- Dependencies: 222
-- Name: COLUMN workspace_files.is_public; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_files.is_public IS '공개 여부';


--
-- TOC entry 3801 (class 0 OID 0)
-- Dependencies: 222
-- Name: COLUMN workspace_files.version; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_files.version IS '파일 버전';


--
-- TOC entry 3802 (class 0 OID 0)
-- Dependencies: 222
-- Name: COLUMN workspace_files.version_of; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_files.version_of IS '원본 파일 ID';


--
-- TOC entry 3803 (class 0 OID 0)
-- Dependencies: 222
-- Name: COLUMN workspace_files.uploaded_by; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_files.uploaded_by IS '업로드 사용자';


--
-- TOC entry 3804 (class 0 OID 0)
-- Dependencies: 222
-- Name: COLUMN workspace_files.uploaded_at; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_files.uploaded_at IS '업로드 일시';


--
-- TOC entry 3805 (class 0 OID 0)
-- Dependencies: 222
-- Name: COLUMN workspace_files.modified_by; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_files.modified_by IS '최종 수정자';


--
-- TOC entry 3806 (class 0 OID 0)
-- Dependencies: 222
-- Name: COLUMN workspace_files.modified_at; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_files.modified_at IS '수정일시';


--
-- TOC entry 220 (class 1259 OID 19631)
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
-- TOC entry 3807 (class 0 OID 0)
-- Dependencies: 220
-- Name: COLUMN workspace_groups.group_name; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_groups.group_name IS '그룹명';


--
-- TOC entry 3808 (class 0 OID 0)
-- Dependencies: 220
-- Name: COLUMN workspace_groups.group_display_name; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_groups.group_display_name IS '그룹 표시명';


--
-- TOC entry 3809 (class 0 OID 0)
-- Dependencies: 220
-- Name: COLUMN workspace_groups.permission_level; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_groups.permission_level IS '권한 레벨 (read/write/admin)';


--
-- TOC entry 3810 (class 0 OID 0)
-- Dependencies: 220
-- Name: COLUMN workspace_groups.created_by; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_groups.created_by IS '생성자';


--
-- TOC entry 3811 (class 0 OID 0)
-- Dependencies: 220
-- Name: COLUMN workspace_groups.created_at; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_groups.created_at IS '생성일시';


--
-- TOC entry 228 (class 1259 OID 19793)
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
-- TOC entry 3812 (class 0 OID 0)
-- Dependencies: 228
-- Name: COLUMN workspace_users.user_id; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_users.user_id IS '사용자 ID';


--
-- TOC entry 3813 (class 0 OID 0)
-- Dependencies: 228
-- Name: COLUMN workspace_users.user_display_name; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_users.user_display_name IS '사용자 표시명';


--
-- TOC entry 3814 (class 0 OID 0)
-- Dependencies: 228
-- Name: COLUMN workspace_users.permission_level; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_users.permission_level IS '권한 레벨 (read/write/admin)';


--
-- TOC entry 3815 (class 0 OID 0)
-- Dependencies: 228
-- Name: COLUMN workspace_users.created_by; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_users.created_by IS '생성자';


--
-- TOC entry 3816 (class 0 OID 0)
-- Dependencies: 228
-- Name: COLUMN workspace_users.created_at; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspace_users.created_at IS '생성일시';


--
-- TOC entry 218 (class 1259 OID 19598)
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
-- TOC entry 3817 (class 0 OID 0)
-- Dependencies: 218
-- Name: COLUMN workspaces.name; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspaces.name IS '워크스페이스 이름';


--
-- TOC entry 3818 (class 0 OID 0)
-- Dependencies: 218
-- Name: COLUMN workspaces.slug; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspaces.slug IS 'URL 친화적 이름';


--
-- TOC entry 3819 (class 0 OID 0)
-- Dependencies: 218
-- Name: COLUMN workspaces.description; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspaces.description IS '워크스페이스 설명';


--
-- TOC entry 3820 (class 0 OID 0)
-- Dependencies: 218
-- Name: COLUMN workspaces.is_active; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspaces.is_active IS '활성화 상태';


--
-- TOC entry 3821 (class 0 OID 0)
-- Dependencies: 218
-- Name: COLUMN workspaces.settings; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspaces.settings IS '워크스페이스 설정 JSON';


--
-- TOC entry 3822 (class 0 OID 0)
-- Dependencies: 218
-- Name: COLUMN workspaces.created_by; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspaces.created_by IS '생성자';


--
-- TOC entry 3823 (class 0 OID 0)
-- Dependencies: 218
-- Name: COLUMN workspaces.updated_by; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspaces.updated_by IS '최종 수정자';


--
-- TOC entry 3824 (class 0 OID 0)
-- Dependencies: 218
-- Name: COLUMN workspaces.created_at; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspaces.created_at IS '생성일시';


--
-- TOC entry 3825 (class 0 OID 0)
-- Dependencies: 218
-- Name: COLUMN workspaces.updated_at; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.workspaces.updated_at IS '수정일시';


--
-- TOC entry 3513 (class 2604 OID 19778)
-- Name: personal_test_measurement_data id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.personal_test_measurement_data ALTER COLUMN id SET DEFAULT nextval('public.personal_test_measurement_data_id_seq'::regclass);


--
-- TOC entry 3743 (class 0 OID 19593)
-- Dependencies: 217
-- Data for Name: alembic_version; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.alembic_version (version_num) VALUES ('202412261300');


--
-- TOC entry 3749 (class 0 OID 19712)
-- Dependencies: 223
-- Data for Name: file_shares; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- TOC entry 3747 (class 0 OID 19649)
-- Dependencies: 221
-- Data for Name: mvp_module_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- TOC entry 3745 (class 0 OID 19612)
-- Dependencies: 219
-- Data for Name: mvp_modules; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- TOC entry 3751 (class 0 OID 19768)
-- Dependencies: 225
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
-- TOC entry 3753 (class 0 OID 19775)
-- Dependencies: 227
-- Data for Name: personal_test_measurement_data; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.personal_test_measurement_data (id, equipment_type, equipment_code, measurement_code, measurement_desc, measurement_value, "timestamp") VALUES (1, 'A1', 'A101', 'TG-001', '압력', 230.000, '2025-06-27 21:48:30.995239+09');
INSERT INTO public.personal_test_measurement_data (id, equipment_type, equipment_code, measurement_code, measurement_desc, measurement_value, "timestamp") VALUES (2, 'A1', 'A101', 'TG-002', '전단차압', 10.000, '2025-06-27 21:48:30.995239+09');
INSERT INTO public.personal_test_measurement_data (id, equipment_type, equipment_code, measurement_code, measurement_desc, measurement_value, "timestamp") VALUES (3, 'B1', 'B101', 'TF-928', '흡입력', 2900000.010, '2025-06-27 21:48:30.995239+09');
INSERT INTO public.personal_test_measurement_data (id, equipment_type, equipment_code, measurement_code, measurement_desc, measurement_value, "timestamp") VALUES (4, 'B1', 'B101', 'TF-929', '토출압', 3100000.000, '2025-06-27 21:48:30.995239+09');
INSERT INTO public.personal_test_measurement_data (id, equipment_type, equipment_code, measurement_code, measurement_desc, measurement_value, "timestamp") VALUES (5, 'C1', 'C101', 'TP-101', '온도', 25.500, '2025-06-27 21:48:30.995239+09');
INSERT INTO public.personal_test_measurement_data (id, equipment_type, equipment_code, measurement_code, measurement_desc, measurement_value, "timestamp") VALUES (6, 'C1', 'C101', 'TP-102', '습도', 65.300, '2025-06-27 21:48:30.995239+09');
INSERT INTO public.personal_test_measurement_data (id, equipment_type, equipment_code, measurement_code, measurement_desc, measurement_value, "timestamp") VALUES (7, 'C2', 'C201', 'TS-201', '유량', 1250.000, '2025-06-27 21:48:30.995239+09');
INSERT INTO public.personal_test_measurement_data (id, equipment_type, equipment_code, measurement_code, measurement_desc, measurement_value, "timestamp") VALUES (8, 'D1', 'D101', 'PC-101', '압축비', 3.500, '2025-06-27 21:48:30.995239+09');
INSERT INTO public.personal_test_measurement_data (id, equipment_type, equipment_code, measurement_code, measurement_desc, measurement_value, "timestamp") VALUES (9, 'D1', 'D101', 'TC-101', '온도', 85.200, '2025-06-27 21:48:30.995239+09');
INSERT INTO public.personal_test_measurement_data (id, equipment_type, equipment_code, measurement_code, measurement_desc, measurement_value, "timestamp") VALUES (10, 'D2', 'D201', 'FL-201', '유량', 450.750, '2025-06-27 21:48:30.995239+09');
INSERT INTO public.personal_test_measurement_data (id, equipment_type, equipment_code, measurement_code, measurement_desc, measurement_value, "timestamp") VALUES (11, 'E1', 'E101', 'LV-101', '레벨', 75.000, '2025-06-27 21:48:30.995239+09');
INSERT INTO public.personal_test_measurement_data (id, equipment_type, equipment_code, measurement_code, measurement_desc, measurement_value, "timestamp") VALUES (12, 'E1', 'E101', 'PR-101', '압력', 101.300, '2025-06-27 21:48:30.995239+09');
INSERT INTO public.personal_test_measurement_data (id, equipment_type, equipment_code, measurement_code, measurement_desc, measurement_value, "timestamp") VALUES (13, 'F1', 'F101', 'PO-101', '개도율', 85.000, '2025-06-27 21:48:30.995239+09');
INSERT INTO public.personal_test_measurement_data (id, equipment_type, equipment_code, measurement_code, measurement_desc, measurement_value, "timestamp") VALUES (14, 'G1', 'G101', 'TH-101', '온도', 250.000, '2025-06-27 21:48:30.995239+09');
INSERT INTO public.personal_test_measurement_data (id, equipment_type, equipment_code, measurement_code, measurement_desc, measurement_value, "timestamp") VALUES (15, 'G1', 'G101', 'PW-101', '전력', 125.500, '2025-06-27 21:48:30.995239+09');
INSERT INTO public.personal_test_measurement_data (id, equipment_type, equipment_code, measurement_code, measurement_desc, measurement_value, "timestamp") VALUES (16, 'H1', 'H101', 'TC-101', '냉각온도', -15.000, '2025-06-27 21:48:30.995239+09');
INSERT INTO public.personal_test_measurement_data (id, equipment_type, equipment_code, measurement_code, measurement_desc, measurement_value, "timestamp") VALUES (17, 'I1', 'I101', 'SP-101', '회전속도', 1800.000, '2025-06-27 21:48:30.995239+09');
INSERT INTO public.personal_test_measurement_data (id, equipment_type, equipment_code, measurement_code, measurement_desc, measurement_value, "timestamp") VALUES (18, 'J1', 'J101', 'DF-101', '차압', 2.500, '2025-06-27 21:48:30.995239+09');
INSERT INTO public.personal_test_measurement_data (id, equipment_type, equipment_code, measurement_code, measurement_desc, measurement_value, "timestamp") VALUES (19, 'K1', 'K101', 'TR-101', '반응온도', 350.000, '2025-06-27 21:48:30.995239+09');
INSERT INTO public.personal_test_measurement_data (id, equipment_type, equipment_code, measurement_code, measurement_desc, measurement_value, "timestamp") VALUES (20, 'K1', 'K101', 'PR-101', '반응압력', 25.000, '2025-06-27 21:48:30.995239+09');


--
-- TOC entry 3750 (class 0 OID 19758)
-- Dependencies: 224
-- Data for Name: personal_test_process_flows; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.personal_test_process_flows (id, workspace_id, name, flow_data, created_by, created_at, updated_at, is_published, published_at, publish_token) VALUES ('9987a1a8-ea91-4b88-81b6-9b59cb423317', '21ee03db-90c4-4592-b00f-c44801e0b164', 'New Process Flow', '{"edges": [{"id": "reactflow__edge-A1_1751029300788-B1_1751029303260", "source": "A1_1751029300788", "target": "B1_1751029303260", "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-B1_1751029303260-C1_1751029308966", "source": "B1_1751029303260", "target": "C1_1751029308966", "sourceHandle": null, "targetHandle": null}], "nodes": [{"id": "A1_1751029300788", "data": {"icon": "gauge", "label": "감압기", "status": "STOP", "equipmentName": "감압기", "equipmentType": "A1"}, "type": "equipment", "width": 150, "height": 84, "dragging": false, "position": {"x": 10.508966731179726, "y": -90.13639232926076}, "selected": false, "positionAbsolute": {"x": 10.508966731179726, "y": -90.13639232926076}}, {"id": "B1_1751029303260", "data": {"icon": "activity", "label": "차압기", "status": "STOP", "equipmentName": "차압기", "equipmentType": "B1"}, "type": "equipment", "width": 150, "height": 84, "dragging": false, "position": {"x": 159.50747254529767, "y": 76.98505490940482}, "selected": false, "positionAbsolute": {"x": 159.50747254529767, "y": 76.98505490940482}}, {"id": "C1_1751029308966", "data": {"icon": "filter", "label": "흡착기", "status": "STOP", "equipmentName": "흡착기", "equipmentType": "C1"}, "type": "equipment", "width": 150, "height": 84, "dragging": false, "position": {"x": 548.6631667264176, "y": 170.24091945484332}, "selected": true, "positionAbsolute": {"x": 548.6631667264176, "y": 170.24091945484332}}, {"id": "C2_1751029364143", "data": {"icon": "thermometer", "label": "측정기", "status": "STOP", "equipmentName": "측정기", "equipmentType": "C2"}, "type": "equipment", "width": 150, "height": 84, "dragging": false, "position": {"x": 74.45412418235304, "y": 250}, "selected": false, "positionAbsolute": {"x": 74.45412418235304, "y": 250}}, {"id": "D1_1751029368314", "data": {"icon": "wind", "label": "압축기", "status": "STOP", "equipmentName": "압축기", "equipmentType": "D1"}, "type": "equipment", "width": 150, "height": 84, "position": {"x": 250, "y": 250}}, {"id": "D2_1751029369046", "data": {"icon": "zap", "label": "펌프", "status": "STOP", "equipmentName": "펌프", "equipmentType": "D2"}, "type": "equipment", "width": 150, "height": 84, "dragging": false, "position": {"x": 426.59704872673467, "y": 250}, "selected": false, "positionAbsolute": {"x": 426.59704872673467, "y": 250}}, {"id": "E1_1751029371078", "data": {"icon": "database", "label": "탱크", "status": "STOP", "equipmentName": "탱크", "equipmentType": "E1"}, "type": "equipment", "width": 150, "height": 84, "dragging": false, "position": {"x": 70.24943254600225, "y": 383.4989594541386}, "selected": false, "positionAbsolute": {"x": 70.24943254600225, "y": 383.4989594541386}}, {"id": "E2_1751029373161", "data": {"icon": "archive", "label": "저장탱크", "status": "STOP", "equipmentName": "저장탱크", "equipmentType": "E2"}, "type": "equipment", "width": 150, "height": 84, "dragging": false, "position": {"x": 263.6652478181402, "y": 380.34544072687555}, "selected": false, "positionAbsolute": {"x": 263.6652478181402, "y": 380.34544072687555}}, {"id": "F1_1751029374912", "data": {"icon": "git-merge", "label": "밸브", "status": "STOP", "equipmentName": "밸브", "equipmentType": "F1"}, "type": "equipment", "width": 150, "height": 84, "dragging": false, "position": {"x": 448.67167981757643, "y": 378.24309490870013}, "selected": false, "positionAbsolute": {"x": 448.67167981757643, "y": 378.24309490870013}}, {"id": "G1_1751029376756", "data": {"icon": "flame", "label": "히터", "status": "STOP", "equipmentName": "히터", "equipmentType": "G1"}, "type": "equipment", "width": 150, "height": 84, "dragging": false, "position": {"x": 635.7804576351881, "y": 390.85716981775266}, "selected": false, "positionAbsolute": {"x": 635.7804576351881, "y": 390.85716981775266}}]}', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-06-27 22:04:16.616456+09', '2025-06-27 22:04:16.616456+09', false, NULL, NULL);
INSERT INTO public.personal_test_process_flows (id, workspace_id, name, flow_data, created_by, created_at, updated_at, is_published, published_at, publish_token) VALUES ('eed16ebd-efe5-4f5c-be40-5466ff4356a0', '21ee03db-90c4-4592-b00f-c44801e0b164', '샘플공정도2', '{"edges": [{"id": "reactflow__edge-_1751085089714-B1_1751085115749", "type": "smoothstep", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "_1751085089714", "target": "B1_1751085115749", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-_1751085089714-G1_1751085108606", "type": "straight", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "_1751085089714", "target": "G1_1751085108606", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-B1_1751085115749-E1_1751085118930", "type": "bezier", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "B1_1751085115749", "target": "E1_1751085118930", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-E1_1751085118930-E2_1751085155514", "type": "smoothstep", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "E1_1751085118930", "target": "E2_1751085155514", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-G1_1751085108606-E2_1751085155514", "type": "bezier", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "G1_1751085108606", "target": "E2_1751085155514", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}], "nodes": [{"id": "_1751085089714", "data": {"icon": "settings", "label": "감압기", "status": "STOP", "equipmentCode": "A101", "equipmentName": "감압기", "equipmentType": "A1", "displayMeasurements": ["TG-001", "TG-002"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": -90, "y": 80}, "selected": false, "positionAbsolute": {"x": -90, "y": 80}}, {"id": "G1_1751085108606", "data": {"icon": "flame", "label": "히터", "status": "STOP", "equipmentCode": "G101", "equipmentName": "히터", "equipmentType": "G1", "displayMeasurements": ["TH-101", "PW-101"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": -90, "y": 450}, "selected": false, "positionAbsolute": {"x": -90, "y": 450}}, {"id": "B1_1751085115749", "data": {"icon": "activity", "label": "차압기", "status": "STOP", "equipmentCode": "B101", "equipmentName": "차압기", "equipmentType": "B1", "displayMeasurements": ["TF-928"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 130, "y": 450}, "selected": false, "positionAbsolute": {"x": 130, "y": 450}}, {"id": "E1_1751085118930", "data": {"icon": "database", "label": "탱크", "status": "STOP", "equipmentCode": "E101", "equipmentName": "탱크", "equipmentType": "E1", "displayMeasurements": ["LV-101"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 350, "y": 800}, "selected": false, "positionAbsolute": {"x": 350, "y": 800}}, {"id": "E2_1751085155514", "data": {"icon": "archive", "label": "저장탱크", "status": "STOP", "equipmentCode": "E201", "equipmentName": "저장탱크", "equipmentType": "E2", "displayMeasurements": []}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 60, "y": 1110}, "selected": true, "positionAbsolute": {"x": 60, "y": 1110}}]}', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-06-28 13:33:13.098548+09', '2025-06-28 13:33:13.098548+09', false, NULL, NULL);
INSERT INTO public.personal_test_process_flows (id, workspace_id, name, flow_data, created_by, created_at, updated_at, is_published, published_at, publish_token) VALUES ('116675b3-43cb-4a93-986b-e6c133204d16', '21ee03db-90c4-4592-b00f-c44801e0b164', '샘플 공정도', '{"edges": [{"id": "reactflow__edge-A1_1751073324228-C2_1751073352895", "type": "step", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "A1_1751073324228", "target": "C2_1751073352895", "animated": false, "selected": false, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-B1_1751073343571-D2_1751077257073", "type": "step", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "B1_1751073343571", "target": "D2_1751077257073", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-D2_1751083266771-A1_1751083245170", "type": "bezier", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "D2_1751083266771", "target": "A1_1751083245170", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-B1_1751083289433-A1_1751083312881", "type": "smoothstep", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "B1_1751083289433", "target": "A1_1751083312881", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-D2_1751077257073-E2_1751083457125", "type": "step", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "D2_1751077257073", "target": "E2_1751083457125", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-E2_1751083457125-G1_1751083499986", "type": "straight", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "E2_1751083457125", "target": "G1_1751083499986", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-G1_1751083499986-D1_1751083531907", "type": "smoothstep", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "G1_1751083499986", "target": "D1_1751083531907", "animated": false, "selected": false, "selectable": true, "sourceHandle": null, "targetHandle": null}, {"id": "reactflow__edge-D1_1751083531907-E1_1751083480473", "type": "bezier", "style": {"stroke": "#000", "strokeWidth": 2}, "source": "D1_1751083531907", "target": "E1_1751083480473", "animated": false, "selectable": true, "sourceHandle": null, "targetHandle": null}], "nodes": [{"id": "A1_1751073324228", "data": {"icon": "gauge", "label": "감압기", "status": "STOP", "equipmentCode": "A101", "equipmentName": "감압기", "equipmentType": "A1", "displayMeasurements": ["TG-001", "TG-002"]}, "type": "equipment", "style": {"width": 211, "height": 170}, "width": 211, "height": 170, "dragging": false, "position": {"x": 130, "y": 200}, "resizing": false, "selected": false, "positionAbsolute": {"x": 130, "y": 200}}, {"id": "B1_1751073343571", "data": {"icon": "activity", "label": "차압기", "status": "STOP", "equipmentCode": "B101", "equipmentName": "차압기", "equipmentType": "B1", "displayMeasurements": ["TF-928", "TF-929"]}, "type": "equipment", "style": {"width": 208, "height": 170}, "width": 208, "height": 170, "dragging": false, "position": {"x": 360, "y": 200}, "resizing": false, "selected": false, "positionAbsolute": {"x": 360, "y": 200}}, {"id": "C2_1751073352895", "data": {"icon": "thermometer", "label": "측정기", "status": "STOP", "equipmentCode": "C201", "equipmentName": "측정기", "equipmentType": "C2", "displayMeasurements": ["TS-201"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 135.5, "y": 525.6838827115021}, "selected": false, "positionAbsolute": {"x": 135.03774814099847, "y": 525.6838827115021}}, {"id": "D2_1751077257073", "data": {"icon": "zap", "label": "펌프", "status": "STOP", "equipmentCode": "D201", "equipmentName": "펌프", "equipmentType": "D2", "displayMeasurements": ["FL-201"]}, "type": "equipment", "style": {"width": 210, "height": 220}, "width": 210, "height": 220, "dragging": false, "position": {"x": 430, "y": 500}, "resizing": false, "selected": false, "positionAbsolute": {"x": 430, "y": 500}}, {"id": "group_1751077454819", "data": {"color": "#ff8080", "label": "Group"}, "type": "group", "style": {"width": 1276, "height": 808, "zIndex": -1}, "width": 1276, "height": 808, "dragging": false, "position": {"x": 40, "y": 120}, "resizing": false, "selected": false, "positionAbsolute": {"x": 40, "y": 120}}, {"id": "A1_1751083245170", "data": {"icon": "gauge", "label": "감압기", "status": "STOP", "equipmentCode": "A101", "equipmentName": "감압기", "equipmentType": "A1", "displayMeasurements": ["TG-001", "TG-002"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 660, "y": 530}, "selected": false, "positionAbsolute": {"x": 660, "y": 530}}, {"id": "D2_1751083266771", "data": {"icon": "zap", "label": "펌프", "status": "STOP", "equipmentCode": "D201", "equipmentName": "펌프", "equipmentType": "D2", "displayMeasurements": ["FL-201"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 720, "y": 200}, "selected": false, "positionAbsolute": {"x": 720, "y": 200}}, {"id": "B1_1751083289433", "data": {"icon": "activity", "label": "차압기", "status": "STOP", "equipmentCode": "B101", "equipmentName": "차압기", "equipmentType": "B1", "displayMeasurements": ["TF-928", "TF-929"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 930, "y": 200}, "selected": false, "positionAbsolute": {"x": 930, "y": 200}}, {"id": "A1_1751083312881", "data": {"icon": "gauge", "label": "감압기", "status": "STOP", "equipmentCode": "A101", "equipmentName": "감압기", "equipmentType": "A1", "displayMeasurements": ["TG-001", "TG-002"]}, "type": "equipment", "style": {"width": 200, "height": 170}, "width": 200, "height": 170, "dragging": false, "position": {"x": 1000, "y": 550}, "selected": false, "positionAbsolute": {"x": 1000, "y": 550}}, {"id": "group_1751083444956", "data": {"color": "#3b82f6", "label": "Group"}, "type": "group", "style": {"width": 550, "height": 510, "zIndex": -1}, "width": 550, "height": 510, "dragging": false, "position": {"x": -1370, "y": 480}, "resizing": false, "selected": false, "positionAbsolute": {"x": -1370, "y": 480}}, {"id": "E2_1751083457125", "data": {"icon": "archive", "label": "저장탱크", "status": "STOP", "equipmentCode": "E201", "equipmentName": "저장탱크", "equipmentType": "E2", "displayMeasurements": []}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": -1250, "y": 580}, "selected": false, "positionAbsolute": {"x": -1250, "y": 580}}, {"id": "E1_1751083480473", "data": {"icon": "database", "label": "탱크", "status": "STOP", "equipmentCode": "E101", "equipmentName": "탱크", "equipmentType": "E1", "displayMeasurements": ["LV-101", "PR-101"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 720, "y": 1180}, "selected": false, "positionAbsolute": {"x": 720, "y": 1180}}, {"id": "group_1751083486315", "data": {"color": "#75f09a", "label": "Group"}, "type": "group", "style": {"width": 960, "height": 450, "zIndex": -1}, "width": 960, "height": 450, "dragging": false, "position": {"x": 50, "y": 1080}, "resizing": false, "selected": false, "positionAbsolute": {"x": 50, "y": 1080}}, {"id": "G1_1751083499986", "data": {"icon": "flame", "label": "히터", "status": "STOP", "equipmentCode": "G101", "equipmentName": "히터", "equipmentType": "G1", "displayMeasurements": ["TH-101", "PW-101"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 90, "y": 1170}, "selected": false, "positionAbsolute": {"x": 90, "y": 1170}}, {"id": "D1_1751083531907", "data": {"icon": "wind", "label": "압축기", "status": "STOP", "equipmentCode": "D101", "equipmentName": "압축기", "equipmentType": "D1", "displayMeasurements": ["PC-101", "TC-101"]}, "type": "equipment", "style": {"width": 200, "height": 220}, "width": 200, "height": 220, "dragging": false, "position": {"x": 400, "y": 1170}, "selected": false, "positionAbsolute": {"x": 400, "y": 1170}}]}', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-06-28 10:18:47.930488+09', '2025-06-28 13:06:23.209895+09', true, '2025-07-01 22:58:01.897738+09', 'WNx2XQ5G3fhM_r8HaJUnGw3z-s9hm-F9ZZ6X3v7GpVQ');


--
-- TOC entry 3748 (class 0 OID 19681)
-- Dependencies: 222
-- Data for Name: workspace_files; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.workspace_files (id, workspace_id, parent_id, name, original_name, file_path, file_size, mime_type, file_hash, is_directory, file_extension, file_metadata, description, is_deleted, is_public, version, version_of, uploaded_by, uploaded_at, modified_by, modified_at) VALUES ('6c391a49-88d1-402b-b64f-bfdcd1f45c93', '21ee03db-90c4-4592-b00f-c44801e0b164', NULL, 'test2', 'test2', '/', 0, 'inode/directory', NULL, true, NULL, '{}', NULL, false, false, 1, NULL, '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-06-26 22:40:49.602836+09', NULL, NULL);


--
-- TOC entry 3746 (class 0 OID 19631)
-- Dependencies: 220
-- Data for Name: workspace_groups; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.workspace_groups (id, workspace_id, group_name, group_display_name, permission_level, created_by, created_at) VALUES ('7b02d9cd-d1a4-4978-a3c3-fa9084ebe1fe', '21ee03db-90c4-4592-b00f-c44801e0b164', '개발팀', NULL, 'read', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-06-29 21:42:46.16532+09');


--
-- TOC entry 3754 (class 0 OID 19793)
-- Dependencies: 228
-- Data for Name: workspace_users; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.workspace_users (id, workspace_id, user_id, user_display_name, permission_level, created_by, created_at) VALUES ('cee60cf8-ce9c-4fa4-8a50-94f19f2f1161', '21ee03db-90c4-4592-b00f-c44801e0b164', 'admin@test.com', NULL, 'admin', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-06-29 21:39:06.684358+09');
INSERT INTO public.workspace_users (id, workspace_id, user_id, user_display_name, permission_level, created_by, created_at) VALUES ('e612d5f8-93e2-4f45-b298-4d1f779bc0ff', '594c3e96-8261-405a-8df2-cf2ccc4062d9', 'admin@test.com', NULL, 'read', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-01 23:00:36.291733+09');


--
-- TOC entry 3744 (class 0 OID 19598)
-- Dependencies: 218
-- Data for Name: workspaces; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.workspaces (id, name, slug, description, is_active, settings, created_by, updated_by, created_at, updated_at, workspace_type, owner_type, owner_id, parent_id, path, is_folder) VALUES ('21ee03db-90c4-4592-b00f-c44801e0b164', 'personal_test', 'personaltest', '', true, '{}', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-06-26 22:33:54.447636+09', NULL, 'PERSONAL', 'USER', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', NULL, '/', false);
INSERT INTO public.workspaces (id, name, slug, description, is_active, settings, created_by, updated_by, created_at, updated_at, workspace_type, owner_type, owner_id, parent_id, path, is_folder) VALUES ('4b624c81-1ab5-4c29-90aa-024a8bb034fe', 'for_is_ch', 'forisch', '', true, '{}', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-06-29 00:05:16.065726+09', NULL, 'GROUP', 'GROUP', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', NULL, '/', false);
INSERT INTO public.workspaces (id, name, slug, description, is_active, settings, created_by, updated_by, created_at, updated_at, workspace_type, owner_type, owner_id, parent_id, path, is_folder) VALUES ('594c3e96-8261-405a-8df2-cf2ccc4062d9', 'ProductionManagement', 'productionmanagement', '', true, '{}', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', '2025-07-01 23:00:36.291733+09', NULL, 'PERSONAL', 'USER', '21a2aaa7-444a-4038-bda3-d8bf2c4ef162', NULL, '/', false);


--
-- TOC entry 3826 (class 0 OID 0)
-- Dependencies: 226
-- Name: personal_test_measurement_data_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.personal_test_measurement_data_id_seq', 20, true);


--
-- TOC entry 3518 (class 2606 OID 19597)
-- Name: alembic_version alembic_version_pkc; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.alembic_version
    ADD CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num);


--
-- TOC entry 3559 (class 2606 OID 19719)
-- Name: file_shares file_shares_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.file_shares
    ADD CONSTRAINT file_shares_pkey PRIMARY KEY (id);


--
-- TOC entry 3561 (class 2606 OID 19721)
-- Name: file_shares file_shares_share_token_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.file_shares
    ADD CONSTRAINT file_shares_share_token_key UNIQUE (share_token);


--
-- TOC entry 3547 (class 2606 OID 19656)
-- Name: mvp_module_logs mvp_module_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.mvp_module_logs
    ADD CONSTRAINT mvp_module_logs_pkey PRIMARY KEY (id);


--
-- TOC entry 3534 (class 2606 OID 19619)
-- Name: mvp_modules mvp_modules_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.mvp_modules
    ADD CONSTRAINT mvp_modules_pkey PRIMARY KEY (id);


--
-- TOC entry 3576 (class 2606 OID 19773)
-- Name: personal_test_equipment_status personal_test_equipment_status_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.personal_test_equipment_status
    ADD CONSTRAINT personal_test_equipment_status_pkey PRIMARY KEY (equipment_code);


--
-- TOC entry 3580 (class 2606 OID 19781)
-- Name: personal_test_measurement_data personal_test_measurement_data_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.personal_test_measurement_data
    ADD CONSTRAINT personal_test_measurement_data_pkey PRIMARY KEY (id);


--
-- TOC entry 3571 (class 2606 OID 19767)
-- Name: personal_test_process_flows personal_test_process_flows_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.personal_test_process_flows
    ADD CONSTRAINT personal_test_process_flows_pkey PRIMARY KEY (id);


--
-- TOC entry 3573 (class 2606 OID 19813)
-- Name: personal_test_process_flows personal_test_process_flows_publish_token_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.personal_test_process_flows
    ADD CONSTRAINT personal_test_process_flows_publish_token_key UNIQUE (publish_token);


--
-- TOC entry 3557 (class 2606 OID 19688)
-- Name: workspace_files workspace_files_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workspace_files
    ADD CONSTRAINT workspace_files_pkey PRIMARY KEY (id);


--
-- TOC entry 3541 (class 2606 OID 19638)
-- Name: workspace_groups workspace_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workspace_groups
    ADD CONSTRAINT workspace_groups_pkey PRIMARY KEY (id);


--
-- TOC entry 3587 (class 2606 OID 19800)
-- Name: workspace_users workspace_users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workspace_users
    ADD CONSTRAINT workspace_users_pkey PRIMARY KEY (id);


--
-- TOC entry 3526 (class 2606 OID 19605)
-- Name: workspaces workspaces_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workspaces
    ADD CONSTRAINT workspaces_pkey PRIMARY KEY (id);


--
-- TOC entry 3562 (class 1259 OID 19730)
-- Name: idx_file_share_expires; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_file_share_expires ON public.file_shares USING btree (expires_at);


--
-- TOC entry 3563 (class 1259 OID 19728)
-- Name: idx_file_share_file; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_file_share_file ON public.file_shares USING btree (file_id);


--
-- TOC entry 3564 (class 1259 OID 19727)
-- Name: idx_file_share_token; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_file_share_token ON public.file_shares USING btree (share_token);


--
-- TOC entry 3527 (class 1259 OID 19625)
-- Name: idx_mvp_module_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_mvp_module_active ON public.mvp_modules USING btree (is_active);


--
-- TOC entry 3528 (class 1259 OID 19626)
-- Name: idx_mvp_module_installed; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_mvp_module_installed ON public.mvp_modules USING btree (is_installed);


--
-- TOC entry 3542 (class 1259 OID 19662)
-- Name: idx_mvp_module_log_action; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_mvp_module_log_action ON public.mvp_module_logs USING btree (action);


--
-- TOC entry 3543 (class 1259 OID 19663)
-- Name: idx_mvp_module_log_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_mvp_module_log_created_at ON public.mvp_module_logs USING btree (created_at);


--
-- TOC entry 3544 (class 1259 OID 19664)
-- Name: idx_mvp_module_log_module; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_mvp_module_log_module ON public.mvp_module_logs USING btree (module_id);


--
-- TOC entry 3529 (class 1259 OID 19627)
-- Name: idx_mvp_module_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_mvp_module_name ON public.mvp_modules USING btree (module_name);


--
-- TOC entry 3530 (class 1259 OID 19628)
-- Name: idx_mvp_module_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_mvp_module_unique ON public.mvp_modules USING btree (workspace_id, module_name);


--
-- TOC entry 3531 (class 1259 OID 19629)
-- Name: idx_mvp_module_workspace; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_mvp_module_workspace ON public.mvp_modules USING btree (workspace_id);


--
-- TOC entry 3574 (class 1259 OID 19789)
-- Name: idx_personal_test_equipment_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_personal_test_equipment_status ON public.personal_test_equipment_status USING btree (equipment_type, status);


--
-- TOC entry 3566 (class 1259 OID 19814)
-- Name: idx_personal_test_flows_publish_token; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_personal_test_flows_publish_token ON public.personal_test_process_flows USING btree (publish_token) WHERE (is_published = true);


--
-- TOC entry 3567 (class 1259 OID 19815)
-- Name: idx_personal_test_flows_published; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_personal_test_flows_published ON public.personal_test_process_flows USING btree (is_published, published_at DESC) WHERE (is_published = true);


--
-- TOC entry 3568 (class 1259 OID 19788)
-- Name: idx_personal_test_flows_updated; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_personal_test_flows_updated ON public.personal_test_process_flows USING btree (updated_at DESC);


--
-- TOC entry 3569 (class 1259 OID 19787)
-- Name: idx_personal_test_flows_workspace; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_personal_test_flows_workspace ON public.personal_test_process_flows USING btree (workspace_id);


--
-- TOC entry 3577 (class 1259 OID 19790)
-- Name: idx_personal_test_measurements_equipment; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_personal_test_measurements_equipment ON public.personal_test_measurement_data USING btree (equipment_code, "timestamp" DESC);


--
-- TOC entry 3578 (class 1259 OID 19791)
-- Name: idx_personal_test_measurements_time; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_personal_test_measurements_time ON public.personal_test_measurement_data USING btree ("timestamp" DESC);


--
-- TOC entry 3519 (class 1259 OID 19606)
-- Name: idx_workspace_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_workspace_active ON public.workspaces USING btree (is_active);


--
-- TOC entry 3520 (class 1259 OID 19607)
-- Name: idx_workspace_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_workspace_created_at ON public.workspaces USING btree (created_at);


--
-- TOC entry 3521 (class 1259 OID 19608)
-- Name: idx_workspace_created_by; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_workspace_created_by ON public.workspaces USING btree (created_by);


--
-- TOC entry 3548 (class 1259 OID 19706)
-- Name: idx_workspace_file_is_deleted; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_workspace_file_is_deleted ON public.workspace_files USING btree (is_deleted);


--
-- TOC entry 3549 (class 1259 OID 19704)
-- Name: idx_workspace_file_mime_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_workspace_file_mime_type ON public.workspace_files USING btree (mime_type);


--
-- TOC entry 3550 (class 1259 OID 19711)
-- Name: idx_workspace_file_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_workspace_file_name ON public.workspace_files USING btree (name);


--
-- TOC entry 3551 (class 1259 OID 19710)
-- Name: idx_workspace_file_parent; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_workspace_file_parent ON public.workspace_files USING btree (parent_id);


--
-- TOC entry 3552 (class 1259 OID 19705)
-- Name: idx_workspace_file_uploaded_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_workspace_file_uploaded_at ON public.workspace_files USING btree (uploaded_at);


--
-- TOC entry 3553 (class 1259 OID 19709)
-- Name: idx_workspace_file_version_of; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_workspace_file_version_of ON public.workspace_files USING btree (version_of);


--
-- TOC entry 3554 (class 1259 OID 19707)
-- Name: idx_workspace_file_workspace; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_workspace_file_workspace ON public.workspace_files USING btree (workspace_id);


--
-- TOC entry 3535 (class 1259 OID 19644)
-- Name: idx_workspace_group_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_workspace_group_name ON public.workspace_groups USING btree (group_name);


--
-- TOC entry 3536 (class 1259 OID 19645)
-- Name: idx_workspace_group_permission; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_workspace_group_permission ON public.workspace_groups USING btree (permission_level);


--
-- TOC entry 3537 (class 1259 OID 19646)
-- Name: idx_workspace_group_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_workspace_group_unique ON public.workspace_groups USING btree (workspace_id, group_name);


--
-- TOC entry 3538 (class 1259 OID 19647)
-- Name: idx_workspace_group_workspace; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_workspace_group_workspace ON public.workspace_groups USING btree (workspace_id);


--
-- TOC entry 3581 (class 1259 OID 19810)
-- Name: idx_workspace_user_permission; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_workspace_user_permission ON public.workspace_users USING btree (permission_level);


--
-- TOC entry 3582 (class 1259 OID 19806)
-- Name: idx_workspace_user_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_workspace_user_unique ON public.workspace_users USING btree (workspace_id, user_id);


--
-- TOC entry 3583 (class 1259 OID 19809)
-- Name: idx_workspace_user_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_workspace_user_user ON public.workspace_users USING btree (user_id);


--
-- TOC entry 3584 (class 1259 OID 19808)
-- Name: idx_workspace_user_workspace; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_workspace_user_workspace ON public.workspace_users USING btree (workspace_id);


--
-- TOC entry 3565 (class 1259 OID 19729)
-- Name: ix_file_shares_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_file_shares_id ON public.file_shares USING btree (id);


--
-- TOC entry 3545 (class 1259 OID 19665)
-- Name: ix_mvp_module_logs_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_mvp_module_logs_id ON public.mvp_module_logs USING btree (id);


--
-- TOC entry 3532 (class 1259 OID 19630)
-- Name: ix_mvp_modules_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_mvp_modules_id ON public.mvp_modules USING btree (id);


--
-- TOC entry 3555 (class 1259 OID 19708)
-- Name: ix_workspace_files_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_workspace_files_id ON public.workspace_files USING btree (id);


--
-- TOC entry 3539 (class 1259 OID 19648)
-- Name: ix_workspace_groups_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_workspace_groups_id ON public.workspace_groups USING btree (id);


--
-- TOC entry 3585 (class 1259 OID 19807)
-- Name: ix_workspace_users_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_workspace_users_id ON public.workspace_users USING btree (id);


--
-- TOC entry 3522 (class 1259 OID 19609)
-- Name: ix_workspaces_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_workspaces_id ON public.workspaces USING btree (id);


--
-- TOC entry 3523 (class 1259 OID 19610)
-- Name: ix_workspaces_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ix_workspaces_name ON public.workspaces USING btree (name);


--
-- TOC entry 3524 (class 1259 OID 19611)
-- Name: ix_workspaces_slug; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX ix_workspaces_slug ON public.workspaces USING btree (slug);


--
-- TOC entry 3595 (class 2606 OID 19722)
-- Name: file_shares file_shares_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.file_shares
    ADD CONSTRAINT file_shares_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.workspace_files(id) ON DELETE CASCADE;


--
-- TOC entry 3591 (class 2606 OID 19657)
-- Name: mvp_module_logs mvp_module_logs_module_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.mvp_module_logs
    ADD CONSTRAINT mvp_module_logs_module_id_fkey FOREIGN KEY (module_id) REFERENCES public.mvp_modules(id) ON DELETE CASCADE;


--
-- TOC entry 3589 (class 2606 OID 19620)
-- Name: mvp_modules mvp_modules_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.mvp_modules
    ADD CONSTRAINT mvp_modules_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- TOC entry 3596 (class 2606 OID 19782)
-- Name: personal_test_measurement_data personal_test_measurement_data_equipment_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.personal_test_measurement_data
    ADD CONSTRAINT personal_test_measurement_data_equipment_code_fkey FOREIGN KEY (equipment_code) REFERENCES public.personal_test_equipment_status(equipment_code);


--
-- TOC entry 3592 (class 2606 OID 19694)
-- Name: workspace_files workspace_files_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workspace_files
    ADD CONSTRAINT workspace_files_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.workspace_files(id) ON DELETE CASCADE;


--
-- TOC entry 3593 (class 2606 OID 19699)
-- Name: workspace_files workspace_files_version_of_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workspace_files
    ADD CONSTRAINT workspace_files_version_of_fkey FOREIGN KEY (version_of) REFERENCES public.workspace_files(id);


--
-- TOC entry 3594 (class 2606 OID 19689)
-- Name: workspace_files workspace_files_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workspace_files
    ADD CONSTRAINT workspace_files_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- TOC entry 3590 (class 2606 OID 19639)
-- Name: workspace_groups workspace_groups_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workspace_groups
    ADD CONSTRAINT workspace_groups_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- TOC entry 3597 (class 2606 OID 19801)
-- Name: workspace_users workspace_users_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workspace_users
    ADD CONSTRAINT workspace_users_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- TOC entry 3588 (class 2606 OID 19748)
-- Name: workspaces workspaces_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workspaces
    ADD CONSTRAINT workspaces_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


-- Completed on 2025-07-02 06:24:29 KST

--
-- PostgreSQL database dump complete
--

