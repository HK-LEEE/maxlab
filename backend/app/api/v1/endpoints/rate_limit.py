"""
Rate Limiting Management API Endpoints
Provides API endpoints for managing rate limits, whitelist/blacklist, and monitoring
"""

from typing import List, Dict, Optional, Any
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
import logging

from ....services.rate_limiter import get_rate_limiter, RateLimitRule
from ....core.auth import get_current_admin_user  # Assuming admin auth exists

logger = logging.getLogger(__name__)

router = APIRouter()

# Pydantic models for API
class RateLimitRuleCreate(BaseModel):
    """Model for creating rate limit rules"""
    endpoint_pattern: str = Field(..., description="Endpoint pattern (supports wildcards)")
    requests_per_window: int = Field(..., gt=0, description="Number of requests allowed per window")
    window_size_seconds: int = Field(..., gt=0, description="Window size in seconds")
    user_role: Optional[str] = Field(None, description="User role (optional)")
    method: Optional[str] = Field(None, description="HTTP method (optional)")
    description: str = Field("", description="Rule description")

class RateLimitRuleResponse(BaseModel):
    """Model for rate limit rule responses"""
    endpoint_pattern: str
    requests_per_window: int
    window_size_seconds: int
    user_role: Optional[str]
    method: Optional[str]
    description: str

class WhitelistEntry(BaseModel):
    """Model for whitelist/blacklist entries"""
    identifier: str = Field(..., description="Identifier to whitelist/blacklist")
    ttl: Optional[int] = Field(None, description="Time to live in seconds (optional)")
    reason: str = Field("", description="Reason for listing")

class RateLimitStatus(BaseModel):
    """Model for rate limit status response"""
    identifier: str
    limit: int
    remaining: int
    reset_time: int
    is_whitelisted: bool
    is_blacklisted: bool
    active_windows: List[Dict[str, Any]]

class RateLimitCheck(BaseModel):
    """Model for rate limit check request"""
    identifier: str = Field(..., description="Identifier to check")
    endpoint: str = Field(..., description="Endpoint path")
    method: str = Field("GET", description="HTTP method")
    user_role: Optional[str] = Field(None, description="User role")

class BulkOperation(BaseModel):
    """Model for bulk whitelist/blacklist operations"""
    identifiers: List[str] = Field(..., description="List of identifiers")
    ttl: Optional[int] = Field(None, description="Time to live in seconds")
    reason: str = Field("", description="Reason for operation")


@router.get("/status", response_model=Dict[str, Any])
async def get_rate_limit_status():
    """Get rate limiting system status"""
    rate_limiter = get_rate_limiter()
    if not rate_limiter:
        raise HTTPException(status_code=503, detail="Rate limiter not available")
    
    try:
        rules = rate_limiter.get_rules()
        return {
            "status": "active",
            "rules_count": len(rules),
            "redis_connected": True,  # Would check Redis connection in practice
            "timestamp": int(__import__("time").time())
        }
    except Exception as e:
        logger.error(f"Error getting rate limit status: {e}")
        raise HTTPException(status_code=500, detail="Failed to get status")


@router.get("/rules", response_model=List[RateLimitRuleResponse])
async def get_rate_limit_rules():
    """Get all rate limiting rules"""
    rate_limiter = get_rate_limiter()
    if not rate_limiter:
        raise HTTPException(status_code=503, detail="Rate limiter not available")
    
    try:
        rules = rate_limiter.get_rules()
        return [RateLimitRuleResponse(**rule) for rule in rules]
    except Exception as e:
        logger.error(f"Error getting rate limit rules: {e}")
        raise HTTPException(status_code=500, detail="Failed to get rules")


@router.post("/rules", response_model=Dict[str, str])
async def add_rate_limit_rule(
    rule: RateLimitRuleCreate,
    # current_user = Depends(get_current_admin_user)  # Uncomment when auth is ready
):
    """Add a new rate limiting rule"""
    rate_limiter = get_rate_limiter()
    if not rate_limiter:
        raise HTTPException(status_code=503, detail="Rate limiter not available")
    
    try:
        new_rule = RateLimitRule(
            endpoint_pattern=rule.endpoint_pattern,
            requests_per_window=rule.requests_per_window,
            window_size_seconds=rule.window_size_seconds,
            user_role=rule.user_role,
            method=rule.method,
            description=rule.description
        )
        
        rate_limiter.add_rule(new_rule)
        
        logger.info(f"Added rate limit rule: {rule.endpoint_pattern}")
        return {"message": "Rate limit rule added successfully"}
        
    except Exception as e:
        logger.error(f"Error adding rate limit rule: {e}")
        raise HTTPException(status_code=500, detail="Failed to add rule")


@router.delete("/rules", response_model=Dict[str, str])
async def remove_rate_limit_rule(
    endpoint_pattern: str = Query(..., description="Endpoint pattern to remove"),
    user_role: Optional[str] = Query(None, description="User role (optional)"),
    # current_user = Depends(get_current_admin_user)
):
    """Remove a rate limiting rule"""
    rate_limiter = get_rate_limiter()
    if not rate_limiter:
        raise HTTPException(status_code=503, detail="Rate limiter not available")
    
    try:
        removed = rate_limiter.remove_rule(endpoint_pattern, user_role)
        
        if removed:
            logger.info(f"Removed rate limit rule: {endpoint_pattern}")
            return {"message": "Rate limit rule removed successfully"}
        else:
            raise HTTPException(status_code=404, detail="Rule not found")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error removing rate limit rule: {e}")
        raise HTTPException(status_code=500, detail="Failed to remove rule")


@router.post("/check", response_model=RateLimitStatus)
async def check_rate_limit(check: RateLimitCheck):
    """Check rate limit status for specific identifier and endpoint"""
    rate_limiter = get_rate_limiter()
    if not rate_limiter:
        raise HTTPException(status_code=503, detail="Rate limiter not available")
    
    try:
        # Check rate limit
        rate_info = rate_limiter.check_rate_limit(
            identifier=check.identifier,
            endpoint=check.endpoint,
            method=check.method,
            user_role=check.user_role
        )
        
        # Get statistics
        stats = rate_limiter.get_statistics(check.identifier)
        
        return RateLimitStatus(
            identifier=check.identifier,
            limit=rate_info.limit,
            remaining=rate_info.remaining,
            reset_time=rate_info.reset_time,
            is_whitelisted=stats.get("is_whitelisted", False),
            is_blacklisted=stats.get("is_blacklisted", False),
            active_windows=stats.get("active_windows", [])
        )
        
    except Exception as e:
        logger.error(f"Error checking rate limit: {e}")
        raise HTTPException(status_code=500, detail="Failed to check rate limit")


@router.get("/statistics/{identifier}", response_model=Dict[str, Any])
async def get_identifier_statistics(identifier: str):
    """Get detailed statistics for a specific identifier"""
    rate_limiter = get_rate_limiter()
    if not rate_limiter:
        raise HTTPException(status_code=503, detail="Rate limiter not available")
    
    try:
        stats = rate_limiter.get_statistics(identifier)
        return stats
    except Exception as e:
        logger.error(f"Error getting statistics: {e}")
        raise HTTPException(status_code=500, detail="Failed to get statistics")


@router.post("/whitelist", response_model=Dict[str, str])
async def add_to_whitelist(
    entry: WhitelistEntry,
    # current_user = Depends(get_current_admin_user)
):
    """Add identifier to whitelist"""
    rate_limiter = get_rate_limiter()
    if not rate_limiter:
        raise HTTPException(status_code=503, detail="Rate limiter not available")
    
    try:
        success = rate_limiter.add_to_whitelist(entry.identifier, entry.ttl)
        
        if success:
            logger.info(f"Added {entry.identifier} to whitelist. Reason: {entry.reason}")
            return {"message": "Identifier added to whitelist successfully"}
        else:
            raise HTTPException(status_code=500, detail="Failed to add to whitelist")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error adding to whitelist: {e}")
        raise HTTPException(status_code=500, detail="Failed to add to whitelist")


@router.delete("/whitelist/{identifier}", response_model=Dict[str, str])
async def remove_from_whitelist(
    identifier: str,
    # current_user = Depends(get_current_admin_user)
):
    """Remove identifier from whitelist"""
    rate_limiter = get_rate_limiter()
    if not rate_limiter:
        raise HTTPException(status_code=503, detail="Rate limiter not available")
    
    try:
        success = rate_limiter.remove_from_whitelist(identifier)
        
        if success:
            logger.info(f"Removed {identifier} from whitelist")
            return {"message": "Identifier removed from whitelist successfully"}
        else:
            raise HTTPException(status_code=404, detail="Identifier not found in whitelist")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error removing from whitelist: {e}")
        raise HTTPException(status_code=500, detail="Failed to remove from whitelist")


@router.post("/blacklist", response_model=Dict[str, str])
async def add_to_blacklist(
    entry: WhitelistEntry,
    # current_user = Depends(get_current_admin_user)
):
    """Add identifier to blacklist"""
    rate_limiter = get_rate_limiter()
    if not rate_limiter:
        raise HTTPException(status_code=503, detail="Rate limiter not available")
    
    try:
        success = rate_limiter.add_to_blacklist(entry.identifier, entry.ttl)
        
        if success:
            logger.warning(f"Added {entry.identifier} to blacklist. Reason: {entry.reason}")
            return {"message": "Identifier added to blacklist successfully"}
        else:
            raise HTTPException(status_code=500, detail="Failed to add to blacklist")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error adding to blacklist: {e}")
        raise HTTPException(status_code=500, detail="Failed to add to blacklist")


@router.delete("/blacklist/{identifier}", response_model=Dict[str, str])
async def remove_from_blacklist(
    identifier: str,
    # current_user = Depends(get_current_admin_user)
):
    """Remove identifier from blacklist"""
    rate_limiter = get_rate_limiter()
    if not rate_limiter:
        raise HTTPException(status_code=503, detail="Rate limiter not available")
    
    try:
        success = rate_limiter.remove_from_blacklist(identifier)
        
        if success:
            logger.info(f"Removed {identifier} from blacklist")
            return {"message": "Identifier removed from blacklist successfully"}
        else:
            raise HTTPException(status_code=404, detail="Identifier not found in blacklist")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error removing from blacklist: {e}")
        raise HTTPException(status_code=500, detail="Failed to remove from blacklist")


@router.post("/whitelist/bulk", response_model=Dict[str, Any])
async def bulk_add_to_whitelist(
    operation: BulkOperation,
    # current_user = Depends(get_current_admin_user)
):
    """Bulk add identifiers to whitelist"""
    rate_limiter = get_rate_limiter()
    if not rate_limiter:
        raise HTTPException(status_code=503, detail="Rate limiter not available")
    
    results = {"success": [], "failed": []}
    
    for identifier in operation.identifiers:
        try:
            success = rate_limiter.add_to_whitelist(identifier, operation.ttl)
            if success:
                results["success"].append(identifier)
            else:
                results["failed"].append(identifier)
        except Exception as e:
            logger.error(f"Failed to whitelist {identifier}: {e}")
            results["failed"].append(identifier)
    
    logger.info(f"Bulk whitelist operation: {len(results['success'])} success, {len(results['failed'])} failed. Reason: {operation.reason}")
    
    return {
        "message": f"Processed {len(operation.identifiers)} identifiers",
        "results": results
    }


@router.post("/blacklist/bulk", response_model=Dict[str, Any])
async def bulk_add_to_blacklist(
    operation: BulkOperation,
    # current_user = Depends(get_current_admin_user)
):
    """Bulk add identifiers to blacklist"""
    rate_limiter = get_rate_limiter()
    if not rate_limiter:
        raise HTTPException(status_code=503, detail="Rate limiter not available")
    
    results = {"success": [], "failed": []}
    
    for identifier in operation.identifiers:
        try:
            success = rate_limiter.add_to_blacklist(identifier, operation.ttl)
            if success:
                results["success"].append(identifier)
            else:
                results["failed"].append(identifier)
        except Exception as e:
            logger.error(f"Failed to blacklist {identifier}: {e}")
            results["failed"].append(identifier)
    
    logger.warning(f"Bulk blacklist operation: {len(results['success'])} success, {len(results['failed'])} failed. Reason: {operation.reason}")
    
    return {
        "message": f"Processed {len(operation.identifiers)} identifiers",
        "results": results
    }


@router.post("/reset/{identifier}", response_model=Dict[str, str])
async def reset_rate_limits(
    identifier: str,
    # current_user = Depends(get_current_admin_user)
):
    """Reset all rate limits for a specific identifier"""
    rate_limiter = get_rate_limiter()
    if not rate_limiter:
        raise HTTPException(status_code=503, detail="Rate limiter not available")
    
    try:
        success = rate_limiter.reset_limits(identifier)
        
        if success:
            logger.info(f"Reset rate limits for {identifier}")
            return {"message": "Rate limits reset successfully"}
        else:
            raise HTTPException(status_code=500, detail="Failed to reset rate limits")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error resetting rate limits: {e}")
        raise HTTPException(status_code=500, detail="Failed to reset rate limits")


@router.post("/cleanup", response_model=Dict[str, Any])
async def cleanup_expired_windows(
    # current_user = Depends(get_current_admin_user)
):
    """Clean up expired rate limit windows"""
    rate_limiter = get_rate_limiter()
    if not rate_limiter:
        raise HTTPException(status_code=503, detail="Rate limiter not available")
    
    try:
        cleaned_count = rate_limiter.cleanup_expired_windows()
        
        logger.info(f"Cleaned up {cleaned_count} expired rate limit windows")
        return {
            "message": "Cleanup completed successfully",
            "cleaned_windows": cleaned_count
        }
        
    except Exception as e:
        logger.error(f"Error during cleanup: {e}")
        raise HTTPException(status_code=500, detail="Failed to cleanup expired windows")


@router.get("/current", response_model=RateLimitStatus)
async def get_current_rate_limit(request: Request):
    """Get rate limit status for current request"""
    rate_limiter = get_rate_limiter()
    if not rate_limiter:
        raise HTTPException(status_code=503, detail="Rate limiter not available")
    
    try:
        # Extract identifier from current request (similar to middleware logic)
        identifier = None
        
        # Try to get IP address
        forwarded_for = request.headers.get("X-Forwarded-For")
        if forwarded_for:
            identifier = f"ip:{forwarded_for.split(',')[0].strip()}"
        elif hasattr(request, "client") and request.client:
            identifier = f"ip:{request.client.host}"
        
        if not identifier:
            raise HTTPException(status_code=400, detail="Could not determine identifier")
        
        # Check current endpoint
        endpoint = request.url.path
        method = request.method
        
        # Get rate limit info
        rate_info = rate_limiter.check_rate_limit(
            identifier=identifier,
            endpoint=endpoint,
            method=method
        )
        
        # Get statistics
        stats = rate_limiter.get_statistics(identifier)
        
        return RateLimitStatus(
            identifier=identifier,
            limit=rate_info.limit,
            remaining=rate_info.remaining,
            reset_time=rate_info.reset_time,
            is_whitelisted=stats.get("is_whitelisted", False),
            is_blacklisted=stats.get("is_blacklisted", False),
            active_windows=stats.get("active_windows", [])
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting current rate limit: {e}")
        raise HTTPException(status_code=500, detail="Failed to get current rate limit")