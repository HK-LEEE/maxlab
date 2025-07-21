"""
언어 감지 및 지역화 유틸리티
HTTP 요청에서 사용자 언어를 감지하고 적절한 언어 코드를 반환합니다.
"""
from typing import Optional, List
import re
from fastapi import Request

from .error_messages import SupportedLanguage

def detect_language_from_request(request: Request) -> str:
    """HTTP 요청에서 사용자 언어 감지"""
    
    # 1. Accept-Language 헤더 확인
    accept_language = request.headers.get("Accept-Language", "")
    if accept_language:
        preferred_lang = parse_accept_language(accept_language)
        if preferred_lang:
            return preferred_lang
    
    # 2. 쿼리 파라미터 확인 (?lang=ko)
    query_lang = request.query_params.get("lang", "").lower()
    if query_lang in [lang.value for lang in SupportedLanguage]:
        return query_lang
    
    # 3. User-Agent 기반 추정 (매우 기본적)
    user_agent = request.headers.get("User-Agent", "").lower()
    if any(kr_pattern in user_agent for kr_pattern in ["ko-kr", "korean"]):
        return SupportedLanguage.KOREAN.value
    elif any(ja_pattern in user_agent for ja_pattern in ["ja-jp", "japanese"]):
        return SupportedLanguage.JAPANESE.value
    elif any(zh_pattern in user_agent for zh_pattern in ["zh-cn", "zh-tw", "chinese"]):
        return SupportedLanguage.CHINESE.value
    
    # 4. 기본값: 영어
    return SupportedLanguage.ENGLISH.value


def parse_accept_language(accept_language: str) -> Optional[str]:
    """Accept-Language 헤더 파싱"""
    try:
        # Accept-Language: ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7
        languages = []
        
        for lang_entry in accept_language.split(","):
            lang_entry = lang_entry.strip()
            
            # q 값이 있는 경우와 없는 경우 처리
            if ";" in lang_entry:
                lang_code, q_part = lang_entry.split(";", 1)
                try:
                    q_value = float(q_part.split("=")[1])
                except (IndexError, ValueError):
                    q_value = 1.0
            else:
                lang_code = lang_entry
                q_value = 1.0
            
            # 언어 코드 정규화
            normalized_lang = normalize_language_code(lang_code.strip())
            if normalized_lang:
                languages.append((normalized_lang, q_value))
        
        # q 값으로 정렬 (높은 순)
        languages.sort(key=lambda x: x[1], reverse=True)
        
        # 지원하는 언어 중 첫 번째 반환
        supported_languages = [lang.value for lang in SupportedLanguage]
        for lang_code, _ in languages:
            if lang_code in supported_languages:
                return lang_code
        
        return None
        
    except Exception:
        return None


def normalize_language_code(lang_code: str) -> Optional[str]:
    """언어 코드 정규화"""
    lang_code = lang_code.lower().strip()
    
    # 언어 코드 매핑
    language_mappings = {
        "ko": SupportedLanguage.KOREAN.value,
        "ko-kr": SupportedLanguage.KOREAN.value,
        "kor": SupportedLanguage.KOREAN.value,
        "korean": SupportedLanguage.KOREAN.value,
        
        "en": SupportedLanguage.ENGLISH.value,
        "en-us": SupportedLanguage.ENGLISH.value,
        "en-gb": SupportedLanguage.ENGLISH.value,
        "eng": SupportedLanguage.ENGLISH.value,
        "english": SupportedLanguage.ENGLISH.value,
        
        "ja": SupportedLanguage.JAPANESE.value,
        "ja-jp": SupportedLanguage.JAPANESE.value,
        "jpn": SupportedLanguage.JAPANESE.value,
        "japanese": SupportedLanguage.JAPANESE.value,
        
        "zh": SupportedLanguage.CHINESE.value,
        "zh-cn": SupportedLanguage.CHINESE.value,
        "zh-tw": SupportedLanguage.CHINESE.value,
        "zh-hk": SupportedLanguage.CHINESE.value,
        "zho": SupportedLanguage.CHINESE.value,
        "chinese": SupportedLanguage.CHINESE.value,
    }
    
    return language_mappings.get(lang_code)


def get_language_from_user_context(user_data: dict) -> str:
    """사용자 컨텍스트에서 언어 추출"""
    # 사용자 프로필의 언어 설정
    if "language" in user_data:
        user_lang = user_data["language"].lower()
        normalized = normalize_language_code(user_lang)
        if normalized:
            return normalized
    
    # 사용자 이메일 도메인 기반 추정
    email = user_data.get("email", "")
    if email:
        domain = email.split("@")[-1].lower()
        if any(kr_domain in domain for kr_domain in [".kr", "korea", "seoul"]):
            return SupportedLanguage.KOREAN.value
        elif any(jp_domain in domain for jp_domain in [".jp", "japan", "tokyo"]):
            return SupportedLanguage.JAPANESE.value
        elif any(cn_domain in domain for cn_domain in [".cn", ".tw", "china", "taiwan"]):
            return SupportedLanguage.CHINESE.value
    
    # 기본값
    return SupportedLanguage.ENGLISH.value


def detect_language_comprehensive(
    request: Optional[Request] = None, 
    user_data: Optional[dict] = None
) -> str:
    """종합적인 언어 감지"""
    
    # 1. 사용자 프로필 기반 (우선순위 높음)
    if user_data:
        user_lang = get_language_from_user_context(user_data)
        if user_lang != SupportedLanguage.ENGLISH.value:  # 기본값이 아닌 경우
            return user_lang
    
    # 2. HTTP 요청 기반
    if request:
        request_lang = detect_language_from_request(request)
        return request_lang
    
    # 3. 기본값
    return SupportedLanguage.ENGLISH.value