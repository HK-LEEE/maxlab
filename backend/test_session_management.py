"""
Test Session Management System
Comprehensive test of the database-backed session management system
"""

import asyncio
import logging
import jwt
import uuid
from datetime import datetime, timedelta
from fastapi import Request
from unittest.mock import Mock

from app.services.async_session_manager import async_session_manager
from app.services.auth_session_service import AuthSessionService
from app.core.config import settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def test_session_creation():
    """Test session creation from JWT token"""
    logger.info("🔬 Testing session creation from JWT...")
    
    try:
        # Create a mock JWT token
        jwt_payload = {
            'sub': 'test-user-123',
            'jti': str(uuid.uuid4()),  # JWT ID
            'email': 'test@example.com',
            'exp': datetime.utcnow() + timedelta(hours=1),
            'iat': datetime.utcnow(),
        }
        
        # Create JWT token
        jwt_token = jwt.encode(jwt_payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
        
        # Mock user data (similar to what comes from OAuth server)
        user_data = {
            'user_id': 'test-user-123',
            'email': 'test@example.com',
            'name': 'Test User',
            'is_admin': False,
            'groups': ['users'],
            'auth_type': 'oauth'
        }
        
        # Mock request object
        mock_request = Mock(spec=Request)
        mock_request.client.host = '127.0.0.1'
        mock_request.headers = {'user-agent': 'Test-Browser/1.0'}
        
        # Test session creation
        session_data = await async_session_manager.create_session_from_jwt(
            jwt_token, user_data, mock_request
        )
        
        if session_data:
            logger.info(f"✅ Session created successfully: {session_data.session_id[:8]}...")
            logger.info(f"   User ID: {session_data.user_id}")
            logger.info(f"   JWT Token ID: {session_data.data.get('jwt_token_id')}")
            logger.info(f"   Expires at: {session_data.expires_at}")
            return session_data
        else:
            logger.error("❌ Failed to create session")
            return None
            
    except Exception as e:
        logger.error(f"❌ Session creation test failed: {e}")
        return None


async def test_session_retrieval(session_id: str):
    """Test session retrieval"""
    logger.info(f"🔍 Testing session retrieval for {session_id[:8]}...")
    
    try:
        session_data = await async_session_manager.get_session(session_id)
        
        if session_data:
            logger.info(f"✅ Session retrieved successfully")
            logger.info(f"   Session ID: {session_data.session_id[:8]}...")
            logger.info(f"   User ID: {session_data.user_id}")
            logger.info(f"   Last accessed: {session_data.last_accessed}")
            logger.info(f"   Is active: {session_data.is_active}")
            return True
        else:
            logger.error("❌ Session not found")
            return False
            
    except Exception as e:
        logger.error(f"❌ Session retrieval test failed: {e}")
        return False


async def test_user_sessions_listing(user_id: str):
    """Test listing all user sessions"""
    logger.info(f"📋 Testing user sessions listing for {user_id}...")
    
    try:
        user_sessions = await async_session_manager.get_user_sessions(user_id)
        
        logger.info(f"✅ Found {len(user_sessions)} sessions for user {user_id}")
        for i, session in enumerate(user_sessions, 1):
            logger.info(f"   Session {i}: {session.session_id[:8]}... (active: {session.is_active})")
        
        return len(user_sessions) > 0
        
    except Exception as e:
        logger.error(f"❌ User sessions listing test failed: {e}")
        return False


async def test_session_sync():
    """Test session sync with JWT"""
    logger.info("🔄 Testing session sync with JWT...")
    
    try:
        # Create a mock JWT token
        jwt_payload = {
            'sub': 'sync-test-user-456',
            'jti': str(uuid.uuid4()),  # JWT ID
            'email': 'synctest@example.com',
            'exp': datetime.utcnow() + timedelta(hours=1),
            'iat': datetime.utcnow(),
        }
        
        jwt_token = jwt.encode(jwt_payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
        
        user_data = {
            'user_id': 'sync-test-user-456',
            'email': 'synctest@example.com',
            'name': 'Sync Test User',
            'is_admin': False,
            'groups': ['users'],
            'auth_type': 'oauth'
        }
        
        # Mock request
        mock_request = Mock(spec=Request)
        mock_request.client.host = '192.168.1.100'
        mock_request.headers = {'user-agent': 'Sync-Test-Browser/2.0'}
        
        # First sync - should create new session
        session_data1 = await async_session_manager.sync_session_with_jwt(
            jwt_token, user_data, mock_request
        )
        
        if session_data1:
            logger.info(f"✅ First sync created session: {session_data1.session_id[:8]}...")
            
            # Second sync with same JWT - should return existing session
            session_data2 = await async_session_manager.sync_session_with_jwt(
                jwt_token, user_data, mock_request
            )
            
            if session_data2 and session_data1.session_id == session_data2.session_id:
                logger.info(f"✅ Second sync returned same session: {session_data2.session_id[:8]}...")
                return True
            else:
                logger.error("❌ Second sync didn't return the same session")
                return False
        else:
            logger.error("❌ First sync failed to create session")
            return False
            
    except Exception as e:
        logger.error(f"❌ Session sync test failed: {e}")
        return False


async def test_session_invalidation(session_id: str):
    """Test session invalidation"""
    logger.info(f"🗑️ Testing session invalidation for {session_id[:8]}...")
    
    try:
        # Invalidate the session
        result = await async_session_manager.invalidate_session(session_id)
        
        if result:
            logger.info("✅ Session invalidated successfully")
            
            # Try to retrieve the invalidated session
            session_data = await async_session_manager.get_session(session_id)
            
            if not session_data:
                logger.info("✅ Invalidated session is no longer retrievable")
                return True
            else:
                logger.error("❌ Invalidated session is still retrievable")
                return False
        else:
            logger.error("❌ Session invalidation failed")
            return False
            
    except Exception as e:
        logger.error(f"❌ Session invalidation test failed: {e}")
        return False


async def run_all_tests():
    """Run all session management tests"""
    logger.info("🚀 Starting comprehensive session management tests...")
    
    test_results = []
    
    # Test 1: Session creation
    session_data = await test_session_creation()
    test_results.append(("Session Creation", session_data is not None))
    
    if session_data:
        # Test 2: Session retrieval
        retrieval_result = await test_session_retrieval(session_data.session_id)
        test_results.append(("Session Retrieval", retrieval_result))
        
        # Test 3: User sessions listing
        listing_result = await test_user_sessions_listing(session_data.user_id)
        test_results.append(("User Sessions Listing", listing_result))
        
        # Test 4: Session sync
        sync_result = await test_session_sync()
        test_results.append(("Session Sync", sync_result))
        
        # Test 5: Session invalidation (should be last)
        invalidation_result = await test_session_invalidation(session_data.session_id)
        test_results.append(("Session Invalidation", invalidation_result))
    
    # Print test summary
    logger.info("📊 Test Results Summary:")
    passed = 0
    total = len(test_results)
    
    for test_name, result in test_results:
        status = "✅ PASS" if result else "❌ FAIL"
        logger.info(f"   {test_name}: {status}")
        if result:
            passed += 1
    
    logger.info(f"📈 Overall: {passed}/{total} tests passed ({passed/total*100:.1f}%)")
    
    if passed == total:
        logger.info("🎉 All session management tests passed!")
        return True
    else:
        logger.error("💥 Some session management tests failed!")
        return False


if __name__ == "__main__":
    logger.info("🧪 Session Management System Test Suite")
    success = asyncio.run(run_all_tests())
    exit(0 if success else 1)