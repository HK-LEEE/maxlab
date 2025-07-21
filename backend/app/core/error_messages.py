"""
MAX Lab 오류 메시지 국제화 및 템플릿 시스템
다국어 지원과 동적 메시지 생성을 위한 메시지 관리 시스템입니다.
"""
from typing import Dict, Any, Optional, Union
from enum import Enum
import re
import logging

logger = logging.getLogger(__name__)


class SupportedLanguage(Enum):
    """지원하는 언어"""
    KOREAN = "ko"
    ENGLISH = "en"
    JAPANESE = "ja"
    CHINESE = "zh"


class MessageTemplate:
    """메시지 템플릿 클래스"""
    
    def __init__(self, template: str, placeholders: Optional[Dict[str, str]] = None):
        self.template = template
        self.placeholders = placeholders or {}
        self._validate_template()
    
    def _validate_template(self):
        """템플릿 유효성 검사"""
        # 플레이스홀더 패턴 확인 (예: {placeholder})
        placeholder_pattern = r'\{([^}]+)\}'
        found_placeholders = re.findall(placeholder_pattern, self.template)
        
        for placeholder in found_placeholders:
            if placeholder not in self.placeholders:
                logger.warning(f"Template placeholder '{placeholder}' not defined in placeholders")
    
    def render(self, **kwargs) -> str:
        """템플릿 렌더링"""
        # 기본 플레이스홀더와 전달받은 값 병합
        render_data = {**self.placeholders, **kwargs}
        
        try:
            # 민감한 정보 필터링
            filtered_data = self._filter_sensitive_data(render_data)
            return self.template.format(**filtered_data)
        except KeyError as e:
            logger.error(f"Missing placeholder in template: {e}")
            return self.template  # 원본 템플릿 반환
        except Exception as e:
            logger.error(f"Error rendering template: {e}")
            return self.template
    
    def _filter_sensitive_data(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """민감한 정보 필터링"""
        sensitive_keys = {
            'password', 'token', 'secret', 'key', 'auth', 'credential',
            'service_token', 'oauth_token', 'jwt', 'session'
        }
        
        filtered = {}
        for key, value in data.items():
            if any(sensitive in key.lower() for sensitive in sensitive_keys):
                filtered[key] = "[REDACTED]"
            else:
                # 문자열 길이 제한 (XSS 방지)
                filtered[key] = str(value)[:200] if isinstance(value, str) else str(value)
        
        return filtered


class ErrorMessageRegistry:
    """오류 메시지 레지스트리"""
    
    def __init__(self):
        self.messages = self._initialize_messages()
    
    def _initialize_messages(self) -> Dict[str, Dict[str, MessageTemplate]]:
        """메시지 초기화"""
        return {
            # AUTH_001: Invalid Token Format
            "AUTH_001": {
                SupportedLanguage.KOREAN.value: MessageTemplate(
                    "세션이 유효하지 않습니다. 다시 로그인해 주세요.",
                    {"action": "다시 로그인", "reason": "세션 오류"}
                ),
                SupportedLanguage.ENGLISH.value: MessageTemplate(
                    "Your session appears to be invalid. Please log in again.",
                    {"action": "log in again", "reason": "session error"}
                ),
                SupportedLanguage.JAPANESE.value: MessageTemplate(
                    "セッションが無効です。再度ログインしてください。",
                    {"action": "再ログイン", "reason": "セッションエラー"}
                ),
                SupportedLanguage.CHINESE.value: MessageTemplate(
                    "您的会话似乎无效。请重新登录。",
                    {"action": "重新登录", "reason": "会话错误"}
                )
            },
            
            # AUTH_002: Expired Token
            "AUTH_002": {
                SupportedLanguage.KOREAN.value: MessageTemplate(
                    "세션이 만료되었습니다. 계속하려면 로그인해 주세요.",
                    {"action": "로그인", "reason": "세션 만료"}
                ),
                SupportedLanguage.ENGLISH.value: MessageTemplate(
                    "Your session has expired. Please log in to continue.",
                    {"action": "log in", "reason": "session expired"}
                ),
                SupportedLanguage.JAPANESE.value: MessageTemplate(
                    "セッションが期限切れです。続行するにはログインしてください。",
                    {"action": "ログイン", "reason": "セッション期限切れ"}
                ),
                SupportedLanguage.CHINESE.value: MessageTemplate(
                    "您的会话已过期。请登录以继续。",
                    {"action": "登录", "reason": "会话过期"}
                )
            },
            
            # AUTH_003: Token Validation Failed
            "AUTH_003": {
                SupportedLanguage.KOREAN.value: MessageTemplate(
                    "세션을 확인할 수 없습니다. 다시 로그인해 주세요.",
                    {"action": "다시 로그인", "reason": "세션 확인 실패"}
                ),
                SupportedLanguage.ENGLISH.value: MessageTemplate(
                    "We couldn't verify your session. Please log in again.",
                    {"action": "log in again", "reason": "session verification failed"}
                ),
                SupportedLanguage.JAPANESE.value: MessageTemplate(
                    "セッションを確認できませんでした。再度ログインしてください。",
                    {"action": "再ログイン", "reason": "セッション確認失敗"}
                ),
                SupportedLanguage.CHINESE.value: MessageTemplate(
                    "我们无法验证您的会话。请重新登录。",
                    {"action": "重新登录", "reason": "会话验证失败"}
                )
            },
            
            # AUTH_004: Missing Authorization Header
            "AUTH_004": {
                SupportedLanguage.KOREAN.value: MessageTemplate(
                    "인증이 필요한 리소스입니다. 로그인해 주세요.",
                    {"action": "로그인", "reason": "인증 필요"}
                ),
                SupportedLanguage.ENGLISH.value: MessageTemplate(
                    "Authentication is required to access this resource.",
                    {"action": "log in", "reason": "authentication required"}
                ),
                SupportedLanguage.JAPANESE.value: MessageTemplate(
                    "このリソースにアクセスするには認証が必要です。",
                    {"action": "ログイン", "reason": "認証が必要"}
                ),
                SupportedLanguage.CHINESE.value: MessageTemplate(
                    "访问此资源需要身份验证。",
                    {"action": "登录", "reason": "需要身份验证"}
                )
            },
            
            # AUTH_005: Token Revoked
            "AUTH_005": {
                SupportedLanguage.KOREAN.value: MessageTemplate(
                    "세션이 종료되었습니다. 다시 로그인해 주세요.",
                    {"action": "다시 로그인", "reason": "세션 종료"}
                ),
                SupportedLanguage.ENGLISH.value: MessageTemplate(
                    "Your session has been terminated. Please log in again.",
                    {"action": "log in again", "reason": "session terminated"}
                ),
                SupportedLanguage.JAPANESE.value: MessageTemplate(
                    "セッションが終了されました。再度ログインしてください。",
                    {"action": "再ログイン", "reason": "セッション終了"}
                ),
                SupportedLanguage.CHINESE.value: MessageTemplate(
                    "您的会话已被终止。请重新登录。",
                    {"action": "重新登录", "reason": "会话终止"}
                )
            },
            
            # CONN_001: OAuth Server Unreachable
            "CONN_001": {
                SupportedLanguage.KOREAN.value: MessageTemplate(
                    "인증 서비스에 연결하는 데 문제가 있습니다. 잠시 후 다시 시도해 주세요.",
                    {"action": "잠시 후 재시도", "reason": "연결 문제"}
                ),
                SupportedLanguage.ENGLISH.value: MessageTemplate(
                    "We're having trouble connecting to our authentication service. Please try again in a moment.",
                    {"action": "try again later", "reason": "connection issue"}
                ),
                SupportedLanguage.JAPANESE.value: MessageTemplate(
                    "認証サービスへの接続に問題があります。しばらくしてから再度お試しください。",
                    {"action": "しばらく後に再試行", "reason": "接続問題"}
                ),
                SupportedLanguage.CHINESE.value: MessageTemplate(
                    "我们在连接身份验证服务时遇到问题。请稍后再试。",
                    {"action": "稍后再试", "reason": "连接问题"}
                )
            },
            
            # CONN_002: OAuth Server Timeout
            "CONN_002": {
                SupportedLanguage.KOREAN.value: MessageTemplate(
                    "인증 서비스 응답이 예상보다 오래 걸리고 있습니다. 다시 시도해 주세요.",
                    {"action": "다시 시도", "reason": "응답 지연"}
                ),
                SupportedLanguage.ENGLISH.value: MessageTemplate(
                    "The authentication service is taking longer than expected. Please try again.",
                    {"action": "try again", "reason": "response delay"}
                ),
                SupportedLanguage.JAPANESE.value: MessageTemplate(
                    "認証サービスの応答が予想より時間がかかっています。再度お試しください。",
                    {"action": "再試行", "reason": "応答遅延"}
                ),
                SupportedLanguage.CHINESE.value: MessageTemplate(
                    "身份验证服务响应时间比预期长。请重试。",
                    {"action": "重试", "reason": "响应延迟"}
                )
            },
            
            # CONN_003: Redis Connection Failed
            "CONN_003": {
                SupportedLanguage.KOREAN.value: MessageTemplate(
                    "일부 기능이 일시적으로 사용할 수 없습니다. 나중에 다시 시도해 주세요.",
                    {"action": "나중에 재시도", "reason": "서비스 일시 중단"}
                ),
                SupportedLanguage.ENGLISH.value: MessageTemplate(
                    "Some features may be temporarily unavailable. Please try again later.",
                    {"action": "try again later", "reason": "service temporarily unavailable"}
                ),
                SupportedLanguage.JAPANESE.value: MessageTemplate(
                    "一部の機能が一時的に利用できません。後でもう一度お試しください。",
                    {"action": "後で再試行", "reason": "サービス一時停止"}
                ),
                SupportedLanguage.CHINESE.value: MessageTemplate(
                    "某些功能可能暂时不可用。请稍后再试。",
                    {"action": "稍后再试", "reason": "服务暂时不可用"}
                )
            },
            
            # CONN_004: Circuit Breaker Open
            "CONN_004": {
                SupportedLanguage.KOREAN.value: MessageTemplate(
                    "인증 서비스가 일시적으로 사용할 수 없습니다. 나중에 다시 시도해 주세요.",
                    {"action": "나중에 재시도", "reason": "서비스 일시 중단"}
                ),
                SupportedLanguage.ENGLISH.value: MessageTemplate(
                    "Authentication service is temporarily unavailable. Please try again later.",
                    {"action": "try again later", "reason": "service temporarily unavailable"}
                ),
                SupportedLanguage.JAPANESE.value: MessageTemplate(
                    "認証サービスが一時的に利用できません。後でもう一度お試しください。",
                    {"action": "後で再試行", "reason": "サービス一時停止"}
                ),
                SupportedLanguage.CHINESE.value: MessageTemplate(
                    "身份验证服务暂时不可用。请稍后再试。",
                    {"action": "稍后再试", "reason": "服务暂时不可用"}
                )
            },
            
            # PERM_001: Insufficient Permissions
            "PERM_001": {
                SupportedLanguage.KOREAN.value: MessageTemplate(
                    "이 작업을 수행할 권한이 없습니다.",
                    {"action": "지원팀 문의", "reason": "권한 부족"}
                ),
                SupportedLanguage.ENGLISH.value: MessageTemplate(
                    "You don't have permission to perform this action.",
                    {"action": "contact support", "reason": "insufficient permissions"}
                ),
                SupportedLanguage.JAPANESE.value: MessageTemplate(
                    "この操作を実行する権限がありません。",
                    {"action": "サポートに連絡", "reason": "権限不足"}
                ),
                SupportedLanguage.CHINESE.value: MessageTemplate(
                    "您没有执行此操作的权限。",
                    {"action": "联系支持", "reason": "权限不足"}
                )
            },
            
            # PERM_002: Admin Privileges Required
            "PERM_002": {
                SupportedLanguage.KOREAN.value: MessageTemplate(
                    "이 작업에는 관리자 권한이 필요합니다.",
                    {"action": "관리자 문의", "reason": "관리자 권한 필요"}
                ),
                SupportedLanguage.ENGLISH.value: MessageTemplate(
                    "Administrator privileges are required for this action.",
                    {"action": "contact administrator", "reason": "admin privileges required"}
                ),
                SupportedLanguage.JAPANESE.value: MessageTemplate(
                    "この操作には管理者権限が必要です。",
                    {"action": "管理者に連絡", "reason": "管理者権限が必要"}
                ),
                SupportedLanguage.CHINESE.value: MessageTemplate(
                    "此操作需要管理员权限。",
                    {"action": "联系管理员", "reason": "需要管理员权限"}
                )
            },
            
            # PERM_003: Workspace Access Denied
            "PERM_003": {
                SupportedLanguage.KOREAN.value: MessageTemplate(
                    "이 워크스페이스에 접근할 권한이 없습니다.",
                    {"action": "워크스페이스 소유자 문의", "reason": "워크스페이스 접근 권한 없음"}
                ),
                SupportedLanguage.ENGLISH.value: MessageTemplate(
                    "You don't have access to this workspace.",
                    {"action": "contact workspace owner", "reason": "workspace access denied"}
                ),
                SupportedLanguage.JAPANESE.value: MessageTemplate(
                    "このワークスペースへのアクセス権限がありません。",
                    {"action": "ワークスペース所有者に連絡", "reason": "ワークスペースアクセス拒否"}
                ),
                SupportedLanguage.CHINESE.value: MessageTemplate(
                    "您没有访问此工作空间的权限。",
                    {"action": "联系工作空间所有者", "reason": "工作空间访问被拒绝"}
                )
            },
            
            # CONFIG_001: Missing SERVICE_TOKEN
            "CONFIG_001": {
                SupportedLanguage.KOREAN.value: MessageTemplate(
                    "시스템 설정 오류입니다. 지원팀에 문의해 주세요.",
                    {"action": "지원팀 문의", "reason": "시스템 설정 오류"}
                ),
                SupportedLanguage.ENGLISH.value: MessageTemplate(
                    "System configuration error. Please contact support.",
                    {"action": "contact support", "reason": "system configuration error"}
                ),
                SupportedLanguage.JAPANESE.value: MessageTemplate(
                    "システム設定エラーです。サポートにお問い合わせください。",
                    {"action": "サポートに連絡", "reason": "システム設定エラー"}
                ),
                SupportedLanguage.CHINESE.value: MessageTemplate(
                    "系统配置错误。请联系支持。",
                    {"action": "联系支持", "reason": "系统配置错误"}
                )
            },
            
            # CONFIG_002: Invalid OAuth Configuration
            "CONFIG_002": {
                SupportedLanguage.KOREAN.value: MessageTemplate(
                    "OAuth 설정 오류입니다. 지원팀에 문의해 주세요.",
                    {"action": "지원팀 문의", "reason": "OAuth 설정 오류"}
                ),
                SupportedLanguage.ENGLISH.value: MessageTemplate(
                    "OAuth configuration error. Please contact support.",
                    {"action": "contact support", "reason": "OAuth configuration error"}
                ),
                SupportedLanguage.JAPANESE.value: MessageTemplate(
                    "OAuth設定エラーです。サポートにお問い合わせください。",
                    {"action": "サポートに連絡", "reason": "OAuth設定エラー"}
                ),
                SupportedLanguage.CHINESE.value: MessageTemplate(
                    "OAuth配置错误。请联系支持。",
                    {"action": "联系支持", "reason": "OAuth配置错误"}
                )
            },
            
            # CONFIG_003: Invalid SERVICE_TOKEN Format
            "CONFIG_003": {
                SupportedLanguage.KOREAN.value: MessageTemplate(
                    "서비스 토큰 형식 오류입니다. 지원팀에 문의해 주세요.",
                    {"action": "지원팀 문의", "reason": "서비스 토큰 형식 오류"}
                ),
                SupportedLanguage.ENGLISH.value: MessageTemplate(
                    "Service token format error. Please contact support.",
                    {"action": "contact support", "reason": "service token format error"}
                ),
                SupportedLanguage.JAPANESE.value: MessageTemplate(
                    "サービストークン形式エラーです。サポートにお問い合わせください。",
                    {"action": "サポートに連絡", "reason": "サービストークン形式エラー"}
                ),
                SupportedLanguage.CHINESE.value: MessageTemplate(
                    "服务令牌格式错误。请联系支持。",
                    {"action": "联系支持", "reason": "服务令牌格式错误"}
                )
            },
            
            # VALID_001: Malformed OAuth Response
            "VALID_001": {
                SupportedLanguage.KOREAN.value: MessageTemplate(
                    "인증 서비스에서 예상치 못한 응답을 받았습니다. 다시 시도해 주세요.",
                    {"action": "다시 시도", "reason": "인증 서비스 응답 오류"}
                ),
                SupportedLanguage.ENGLISH.value: MessageTemplate(
                    "We received an unexpected response from the authentication service. Please try again.",
                    {"action": "try again", "reason": "authentication service response error"}
                ),
                SupportedLanguage.JAPANESE.value: MessageTemplate(
                    "認証サービスから予期しない応答を受信しました。再度お試しください。",
                    {"action": "再試行", "reason": "認証サービス応答エラー"}
                ),
                SupportedLanguage.CHINESE.value: MessageTemplate(
                    "我们收到来自身份验证服务的意外响应。请重试。",
                    {"action": "重试", "reason": "身份验证服务响应错误"}
                )
            },
            
            # VALID_002: Invalid User Data
            "VALID_002": {
                SupportedLanguage.KOREAN.value: MessageTemplate(
                    "사용자 정보를 처리할 수 없습니다. 다시 로그인해 주세요.",
                    {"action": "다시 로그인", "reason": "사용자 정보 처리 오류"}
                ),
                SupportedLanguage.ENGLISH.value: MessageTemplate(
                    "We couldn't process your user information. Please try logging in again.",
                    {"action": "log in again", "reason": "user information processing error"}
                ),
                SupportedLanguage.JAPANESE.value: MessageTemplate(
                    "ユーザー情報を処理できませんでした。再度ログインしてください。",
                    {"action": "再ログイン", "reason": "ユーザー情報処理エラー"}
                ),
                SupportedLanguage.CHINESE.value: MessageTemplate(
                    "我们无法处理您的用户信息。请重新登录。",
                    {"action": "重新登录", "reason": "用户信息处理错误"}
                )
            },
            
            # SYS_001: Internal Server Error
            "SYS_001": {
                SupportedLanguage.KOREAN.value: MessageTemplate(
                    "서버에서 예상치 못한 오류가 발생했습니다. 나중에 다시 시도해 주세요.",
                    {"action": "나중에 재시도", "reason": "서버 오류"}
                ),
                SupportedLanguage.ENGLISH.value: MessageTemplate(
                    "Something went wrong on our end. Please try again later.",
                    {"action": "try again later", "reason": "server error"}
                ),
                SupportedLanguage.JAPANESE.value: MessageTemplate(
                    "サーバーで予期しないエラーが発生しました。後でもう一度お試しください。",
                    {"action": "後で再試行", "reason": "サーバーエラー"}
                ),
                SupportedLanguage.CHINESE.value: MessageTemplate(
                    "我们这边出了点问题。请稍后再试。",
                    {"action": "稍后再试", "reason": "服务器错误"}
                )
            },
            
            # SYS_002: Service Unavailable
            "SYS_002": {
                SupportedLanguage.KOREAN.value: MessageTemplate(
                    "인증 서비스가 일시적으로 사용할 수 없습니다. 나중에 다시 시도해 주세요.",
                    {"action": "나중에 재시도", "reason": "서비스 사용 불가"}
                ),
                SupportedLanguage.ENGLISH.value: MessageTemplate(
                    "Our authentication service is temporarily unavailable. Please try again later.",
                    {"action": "try again later", "reason": "service unavailable"}
                ),
                SupportedLanguage.JAPANESE.value: MessageTemplate(
                    "認証サービスが一時的に利用できません。後でもう一度お試しください。",
                    {"action": "後で再試行", "reason": "サービス利用不可"}
                ),
                SupportedLanguage.CHINESE.value: MessageTemplate(
                    "我们的身份验证服务暂时不可用。请稍后再试。",
                    {"action": "稍后再试", "reason": "服务不可用"}
                )
            }
        }
    
    def get_message(
        self, 
        error_code: str, 
        language: str = SupportedLanguage.ENGLISH.value,
        **kwargs
    ) -> str:
        """오류 메시지 조회"""
        # 지원하지 않는 언어인 경우 영어로 fallback
        if language not in [lang.value for lang in SupportedLanguage]:
            logger.warning(f"Unsupported language '{language}', falling back to English")
            language = SupportedLanguage.ENGLISH.value
        
        # 메시지 템플릿 조회
        if error_code not in self.messages:
            logger.error(f"Error code '{error_code}' not found in message registry")
            return self._get_default_message(language)
        
        if language not in self.messages[error_code]:
            logger.warning(f"Language '{language}' not found for error code '{error_code}', using English")
            language = SupportedLanguage.ENGLISH.value
        
        template = self.messages[error_code][language]
        return template.render(**kwargs)
    
    def _get_default_message(self, language: str = SupportedLanguage.ENGLISH.value) -> str:
        """기본 오류 메시지"""
        default_messages = {
            SupportedLanguage.KOREAN.value: "예상치 못한 오류가 발생했습니다. 나중에 다시 시도해 주세요.",
            SupportedLanguage.ENGLISH.value: "An unexpected error occurred. Please try again later.",
            SupportedLanguage.JAPANESE.value: "予期しないエラーが発生しました。後でもう一度お試しください。",
            SupportedLanguage.CHINESE.value: "发生了意外错误。请稍后再试。"
        }
        
        return default_messages.get(language, default_messages[SupportedLanguage.ENGLISH.value])
    
    def get_action_message(
        self, 
        user_action: str, 
        language: str = SupportedLanguage.ENGLISH.value
    ) -> str:
        """사용자 액션 메시지 조회"""
        action_messages = {
            "login_required": {
                SupportedLanguage.KOREAN.value: "다시 로그인이 필요합니다.",
                SupportedLanguage.ENGLISH.value: "Please log in again.",
                SupportedLanguage.JAPANESE.value: "再度ログインしてください。",
                SupportedLanguage.CHINESE.value: "请重新登录。"
            },
            "retry_allowed": {
                SupportedLanguage.KOREAN.value: "다시 시도할 수 있습니다.",
                SupportedLanguage.ENGLISH.value: "You can try again.",
                SupportedLanguage.JAPANESE.value: "再試行できます。",
                SupportedLanguage.CHINESE.value: "您可以重试。"
            },
            "contact_support": {
                SupportedLanguage.KOREAN.value: "지원팀에 문의해 주세요.",
                SupportedLanguage.ENGLISH.value: "Please contact support.",
                SupportedLanguage.JAPANESE.value: "サポートにお問い合わせください。",
                SupportedLanguage.CHINESE.value: "请联系支持。"
            },
            "wait_and_retry": {
                SupportedLanguage.KOREAN.value: "잠시 후 다시 시도해 주세요.",
                SupportedLanguage.ENGLISH.value: "Please wait and try again.",
                SupportedLanguage.JAPANESE.value: "しばらくしてから再度お試しください。",
                SupportedLanguage.CHINESE.value: "请稍后再试。"
            }
        }
        
        if user_action not in action_messages:
            return ""
        
        if language not in action_messages[user_action]:
            language = SupportedLanguage.ENGLISH.value
        
        return action_messages[user_action][language]


# 전역 메시지 레지스트리 인스턴스
error_message_registry = ErrorMessageRegistry()


def get_localized_error_message(
    error_code: str, 
    language: str = "en",
    **kwargs
) -> str:
    """지역화된 오류 메시지 조회 (편의 함수)"""
    return error_message_registry.get_message(error_code, language, **kwargs)


def get_localized_action_message(
    user_action: str,
    language: str = "en"
) -> str:
    """지역화된 액션 메시지 조회 (편의 함수)"""
    return error_message_registry.get_action_message(user_action, language)