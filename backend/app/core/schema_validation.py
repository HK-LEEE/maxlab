"""
API 응답 스키마 검증
JSON Schema를 사용하여 API 응답의 일관성을 보장합니다.
"""
import json
from typing import Dict, Any, Optional
import jsonschema
from jsonschema import validate, ValidationError
import logging

logger = logging.getLogger(__name__)

# JSON Schema 정의
ERROR_RESPONSE_SCHEMA = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "type": "object",
    "required": ["error"],
    "properties": {
        "error": {
            "type": "object",
            "required": [
                "code", "title", "message", "user_action", 
                "user_action_message", "severity", "timestamp", 
                "request_id", "language"
            ],
            "properties": {
                "code": {
                    "type": "string",
                    "pattern": "^(AUTH|PERM|CONN|CONFIG|VALID|SYS)_\\d{3}$",
                    "description": "Error code in format CATEGORY_NNN"
                },
                "title": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 100
                },
                "message": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 500
                },
                "user_action": {
                    "type": "string",
                    "enum": [
                        "login_required", "retry_allowed", "contact_support",
                        "no_action", "check_configuration", "wait_and_retry"
                    ]
                },
                "user_action_message": {
                    "type": "string",
                    "maxLength": 200
                },
                "severity": {
                    "type": "string",
                    "enum": ["low", "medium", "high", "critical"]
                },
                "timestamp": {
                    "type": "integer",
                    "minimum": 0
                },
                "request_id": {
                    "type": "string",
                    "format": "uuid"
                },
                "language": {
                    "type": "string",
                    "enum": ["ko", "en", "ja", "zh"]
                },
                "details": {
                    "type": "object",
                    "additionalProperties": True
                },
                "context": {
                    "type": "object",
                    "additionalProperties": True
                },
                "help_url": {
                    "type": "string",
                    "format": "uri"
                },
                "correlation_id": {
                    "type": "string",
                    "format": "uuid"
                }
            },
            "additionalProperties": False
        }
    },
    "additionalProperties": False
}

SUCCESS_RESPONSE_SCHEMA = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "type": "object",
    "required": ["data", "timestamp", "request_id"],
    "properties": {
        "data": {
            "description": "Response data - can be any type"
        },
        "message": {
            "type": "string",
            "maxLength": 200
        },
        "timestamp": {
            "type": "integer",
            "minimum": 0
        },
        "request_id": {
            "type": "string",
            "format": "uuid"
        }
    },
    "additionalProperties": False
}

PAGINATED_RESPONSE_SCHEMA = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "type": "object",
    "required": ["data", "pagination", "timestamp", "request_id"],
    "properties": {
        "data": {
            "type": "array",
            "items": {}
        },
        "pagination": {
            "type": "object",
            "required": [
                "page", "per_page", "total", "total_pages", 
                "has_next", "has_prev"
            ],
            "properties": {
                "page": {"type": "integer", "minimum": 1},
                "per_page": {"type": "integer", "minimum": 1, "maximum": 1000},
                "total": {"type": "integer", "minimum": 0},
                "total_pages": {"type": "integer", "minimum": 0},
                "has_next": {"type": "boolean"},
                "has_prev": {"type": "boolean"}
            },
            "additionalProperties": False
        },
        "message": {
            "type": "string",
            "maxLength": 200
        },
        "timestamp": {
            "type": "integer",
            "minimum": 0
        },
        "request_id": {
            "type": "string",
            "format": "uuid"
        }
    },
    "additionalProperties": False
}

VALIDATION_ERROR_RESPONSE_SCHEMA = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "type": "object",
    "required": ["error"],
    "properties": {
        "error": {
            "allOf": [
                {"$ref": "#/definitions/base_error"},
                {
                    "type": "object",
                    "required": ["validation_errors"],
                    "properties": {
                        "validation_errors": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "required": ["field", "message"],
                                "properties": {
                                    "field": {"type": "string"},
                                    "message": {"type": "string"},
                                    "value": {},
                                    "constraint": {"type": "string"}
                                },
                                "additionalProperties": False
                            }
                        }
                    }
                }
            ]
        }
    },
    "definitions": {
        "base_error": ERROR_RESPONSE_SCHEMA["properties"]["error"]
    },
    "additionalProperties": False
}


class ResponseValidator:
    """API 응답 검증기"""
    
    def __init__(self):
        self.schemas = {
            "error": ERROR_RESPONSE_SCHEMA,
            "success": SUCCESS_RESPONSE_SCHEMA,
            "paginated": PAGINATED_RESPONSE_SCHEMA,
            "validation_error": VALIDATION_ERROR_RESPONSE_SCHEMA
        }
    
    def validate_error_response(self, response_data: Dict[str, Any]) -> bool:
        """오류 응답 검증"""
        return self._validate(response_data, "error")
    
    def validate_success_response(self, response_data: Dict[str, Any]) -> bool:
        """성공 응답 검증"""
        return self._validate(response_data, "success")
    
    def validate_paginated_response(self, response_data: Dict[str, Any]) -> bool:
        """페이지네이션 응답 검증"""
        return self._validate(response_data, "paginated")
    
    def validate_validation_error_response(self, response_data: Dict[str, Any]) -> bool:
        """유효성 검사 오류 응답 검증"""
        return self._validate(response_data, "validation_error")
    
    def _validate(self, data: Dict[str, Any], schema_type: str) -> bool:
        """내부 검증 로직"""
        try:
            schema = self.schemas.get(schema_type)
            if not schema:
                logger.error(f"Unknown schema type: {schema_type}")
                return False
            
            validate(instance=data, schema=schema)
            return True
            
        except ValidationError as e:
            logger.error(f"Schema validation failed for {schema_type}: {e.message}")
            logger.debug(f"Validation error details: {e}")
            return False
        except Exception as e:
            logger.error(f"Unexpected error during validation: {e}")
            return False
    
    def get_validation_errors(self, data: Dict[str, Any], schema_type: str) -> Optional[str]:
        """검증 오류 메시지 반환"""
        try:
            schema = self.schemas.get(schema_type)
            if not schema:
                return f"Unknown schema type: {schema_type}"
            
            validate(instance=data, schema=schema)
            return None
            
        except ValidationError as e:
            return e.message
        except Exception as e:
            return str(e)


# 전역 검증기 인스턴스
response_validator = ResponseValidator()


def validate_api_response(response_data: Dict[str, Any], response_type: str = "auto") -> bool:
    """API 응답 검증 (편의 함수)"""
    
    if response_type == "auto":
        # 자동 타입 감지
        if "error" in response_data:
            if "validation_errors" in response_data.get("error", {}):
                response_type = "validation_error"
            else:
                response_type = "error"
        elif "data" in response_data:
            if "pagination" in response_data:
                response_type = "paginated"
            else:
                response_type = "success"
        else:
            logger.warning("Cannot auto-detect response type")
            return False
    
    validator_methods = {
        "error": response_validator.validate_error_response,
        "success": response_validator.validate_success_response,
        "paginated": response_validator.validate_paginated_response,
        "validation_error": response_validator.validate_validation_error_response
    }
    
    validator_method = validator_methods.get(response_type)
    if not validator_method:
        logger.error(f"Unknown response type: {response_type}")
        return False
    
    return validator_method(response_data)


def create_openapi_schemas() -> Dict[str, Any]:
    """OpenAPI/Swagger용 스키마 생성"""
    return {
        "ErrorResponse": ERROR_RESPONSE_SCHEMA,
        "SuccessResponse": SUCCESS_RESPONSE_SCHEMA,
        "PaginatedResponse": PAGINATED_RESPONSE_SCHEMA,
        "ValidationErrorResponse": VALIDATION_ERROR_RESPONSE_SCHEMA
    }