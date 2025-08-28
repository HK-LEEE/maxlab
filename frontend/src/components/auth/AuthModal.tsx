import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import OAuthLoginButton from './OAuthLoginButton';

interface AuthModalProps {
  /** 모달 표시 상태 */
  isOpen: boolean;
  /** 모달 닫기 콜백 */
  onClose: () => void;
  /** 로그인 성공 콜백 */
  onSuccess?: (tokens: { access_token: string; id_token: string }) => void;
  /** 로그인 실패 콜백 */
  onError?: (error: string) => void;
  /** 모달 제목 */
  title?: string;
  /** 설명 텍스트 */
  description?: string;
  /** 다른 사용자로 로그인 옵션 표시 */
  showDifferentUserLogin?: boolean;
  /** 로그인 취소 시 콜백 */
  onCancel?: () => void;
  /** 추가 CSS 클래스 */
  className?: string;
  /** 배경 클릭으로 닫기 비활성화 */
  disableBackdropClose?: boolean;
  /** ESC 키로 닫기 비활성화 */
  disableEscapeClose?: boolean;
  /** 포커스 트랩 비활성화 */
  disableFocusTrap?: boolean;
}

/**
 * MAX Platform OAuth 인증 모달 컴포넌트
 * 
 * 기능:
 * - 모달 형태의 로그인 UI
 * - 접근성 최적화 (포커스 트랩, ARIA)
 * - 반응형 디자인
 * - 키보드 네비게이션
 * - 다른 사용자로 로그인 옵션
 */
const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  onError,
  title = 'MAX Platform 로그인',
  description = '계속하려면 MAX Platform 계정으로 로그인하세요.',
  showDifferentUserLogin = true,
  onCancel,
  className = '',
  disableBackdropClose = false,
  disableEscapeClose = false,
  disableFocusTrap = false,
}) => {
  const [isClosing, setIsClosing] = useState(false);
  const [focusedElementBeforeModal, setFocusedElementBeforeModal] = useState<HTMLElement | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  // 포커스 가능한 요소들
  const getFocusableElements = useCallback(() => {
    if (!modalRef.current) return [];
    
    const focusableSelectors = [
      'button:not([disabled])',
      '[href]:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"]):not([disabled])'
    ].join(', ');

    return Array.from(modalRef.current.querySelectorAll(focusableSelectors)) as HTMLElement[];
  }, []);

  // 포커스 트랩 설정
  const setupFocusTrap = useCallback(() => {
    if (disableFocusTrap) return;

    const focusableElements = getFocusableElements();
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    };

    document.addEventListener('keydown', handleTabKey);
    
    // 첫 번째 요소에 포커스
    firstElement?.focus();

    return () => {
      document.removeEventListener('keydown', handleTabKey);
    };
  }, [disableFocusTrap, getFocusableElements]);

  // 모달 열기/닫기 처리
  useEffect(() => {
    if (isOpen) {
      // 현재 포커스된 요소 저장
      setFocusedElementBeforeModal(document.activeElement as HTMLElement);
      
      // 바디 스크롤 막기
      document.body.style.overflow = 'hidden';
      document.body.style.paddingRight = getScrollbarWidth() + 'px';
      
      // 포커스 트랩 설정
      const cleanupFocusTrap = setupFocusTrap();

      return () => {
        cleanupFocusTrap?.();
      };
    } else {
      // 바디 스크롤 복원
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
      
      // 이전 포커스 복원
      if (focusedElementBeforeModal) {
        focusedElementBeforeModal.focus();
        setFocusedElementBeforeModal(null);
      }
    }
  }, [isOpen, setupFocusTrap, focusedElementBeforeModal]);

  // ESC 키 처리
  useEffect(() => {
    if (!isOpen || disableEscapeClose) return;

    const handleEscKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };

    document.addEventListener('keydown', handleEscKey);
    return () => document.removeEventListener('keydown', handleEscKey);
  }, [isOpen, disableEscapeClose]);

  // 스크롤바 너비 계산
  const getScrollbarWidth = () => {
    const outer = document.createElement('div');
    outer.style.visibility = 'hidden';
    outer.style.overflow = 'scroll';
    document.body.appendChild(outer);

    const inner = document.createElement('div');
    outer.appendChild(inner);

    const scrollbarWidth = outer.offsetWidth - inner.offsetWidth;
    outer.parentNode?.removeChild(outer);

    return scrollbarWidth;
  };

  // 모달 닫기 처리
  const handleClose = useCallback(() => {
    if (isClosing) return;

    setIsClosing(true);
    
    // 애니메이션 시간만큼 지연 후 실제 닫기
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 200);
  }, [isClosing, onClose]);

  // 배경 클릭 처리
  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (disableBackdropClose) return;
    if (e.target === backdropRef.current) {
      handleClose();
    }
  }, [disableBackdropClose, handleClose]);

  // 로그인 성공 처리
  const handleLoginSuccess = useCallback((tokens: { access_token: string; id_token: string }) => {
    onSuccess?.(tokens);
    handleClose();
  }, [onSuccess, handleClose]);

  // 로그인 에러 처리
  const handleLoginError = useCallback((error: string) => {
    onError?.(error);
  }, [onError]);

  // 다른 사용자 로그인 처리
  const handleDifferentUserLogin = useCallback(() => {
    // 다른 사용자로 로그인 시 강제 로그인 프롬프트
    return true; // forceLogin prop으로 전달
  }, []);

  // 취소 처리
  const handleCancel = useCallback(() => {
    onCancel?.();
    handleClose();
  }, [onCancel, handleClose]);

  if (!isOpen && !isClosing) return null;

  return createPortal(
    <div
      ref={backdropRef}
      className={`max-auth-modal-backdrop ${isClosing ? 'closing' : ''}`}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
      aria-describedby="auth-modal-description"
    >
      <div
        ref={modalRef}
        className={`max-auth-modal ${className} ${isClosing ? 'closing' : ''}`}
      >
        {/* 헤더 */}
        <div className="max-auth-modal-header">
          <div className="max-auth-modal-logo">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2L2 7v10c0 5.55 3.84 9.739 9 11 5.16-1.261 9-5.45 9-11V7l-10-5z"/>
              <path d="M10 17l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/>
            </svg>
          </div>
          
          <h2 id="auth-modal-title" className="max-auth-modal-title">
            {title}
          </h2>
          
          <p id="auth-modal-description" className="max-auth-modal-description">
            {description}
          </p>

          <button
            type="button"
            className="max-auth-modal-close"
            onClick={handleClose}
            aria-label="모달 닫기"
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>

        {/* 바디 */}
        <div className="max-auth-modal-body">
          {/* 기본 로그인 버튼 */}
          <div className="max-auth-login-section">
            <OAuthLoginButton
              variant="primary"
              size="lg"
              onSuccess={handleLoginSuccess}
              onError={handleLoginError}
              className="max-auth-primary-btn"
            >
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
              </svg>
              MAX Platform 로그인
            </OAuthLoginButton>
          </div>

          {/* 다른 사용자로 로그인 */}
          {showDifferentUserLogin && (
            <>
              <div className="max-auth-divider">
                <span>또는</span>
              </div>
              
              <div className="max-auth-alternate-section">
                <p className="max-auth-alternate-text">
                  다른 계정을 사용하시나요?
                </p>
                <OAuthLoginButton
                  variant="outline"
                  size="md"
                  forceLogin={true}
                  prompt="select_account"
                  onSuccess={handleLoginSuccess}
                  onError={handleLoginError}
                  className="max-auth-alternate-btn"
                >
                  다른 계정으로 로그인
                </OAuthLoginButton>
              </div>
            </>
          )}

          {/* 추가 정보 */}
          <div className="max-auth-info">
            <p className="max-auth-info-text">
              로그인하면 <a href="/terms" target="_blank" rel="noopener noreferrer">이용약관</a> 및{' '}
              <a href="/privacy" target="_blank" rel="noopener noreferrer">개인정보처리방침</a>에 동의하게 됩니다.
            </p>
          </div>
        </div>

        {/* 푸터 */}
        <div className="max-auth-modal-footer">
          <button
            type="button"
            className="max-auth-cancel-btn"
            onClick={handleCancel}
          >
            취소
          </button>
          
          <div className="max-auth-help">
            <a 
              href="https://dwchem.co.kr/support" 
              target="_blank" 
              rel="noopener noreferrer"
              className="max-auth-help-link"
            >
              도움이 필요하세요?
            </a>
          </div>
        </div>
      </div>

      <style jsx>{`
        .max-auth-modal-backdrop {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 50000;
          padding: 1rem;
          animation: backdropFadeIn 0.2s ease-out;
        }

        .max-auth-modal-backdrop.closing {
          animation: backdropFadeOut 0.2s ease-in;
        }

        .max-auth-modal {
          background: white;
          border-radius: 1rem;
          box-shadow: 0 20px 25px rgba(0, 0, 0, 0.1), 0 10px 10px rgba(0, 0, 0, 0.04);
          max-width: 480px;
          width: 100%;
          max-height: 90vh;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          animation: modalSlideIn 0.3s ease-out;
        }

        .max-auth-modal.closing {
          animation: modalSlideOut 0.2s ease-in;
        }

        /* 헤더 */
        .max-auth-modal-header {
          background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
          color: white;
          padding: 2rem 2rem 1.5rem;
          text-align: center;
          position: relative;
        }

        .max-auth-modal-logo {
          width: 64px;
          height: 64px;
          background: rgba(255, 255, 255, 0.15);
          backdrop-filter: blur(10px);
          border-radius: 1rem;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 1rem;
          border: 2px solid rgba(255, 255, 255, 0.2);
        }

        .max-auth-modal-logo svg {
          width: 32px;
          height: 32px;
        }

        .max-auth-modal-title {
          font-size: 1.5rem;
          font-weight: 700;
          margin: 0 0 0.5rem;
          letter-spacing: -0.025em;
        }

        .max-auth-modal-description {
          font-size: 1rem;
          opacity: 0.9;
          margin: 0;
          line-height: 1.5;
        }

        .max-auth-modal-close {
          position: absolute;
          top: 1rem;
          right: 1rem;
          background: rgba(255, 255, 255, 0.1);
          border: none;
          color: white;
          cursor: pointer;
          padding: 0.5rem;
          border-radius: 0.5rem;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 2.5rem;
          height: 2.5rem;
        }

        .max-auth-modal-close:hover {
          background: rgba(255, 255, 255, 0.2);
        }

        .max-auth-modal-close:focus {
          outline: 2px solid white;
          outline-offset: 2px;
        }

        .max-auth-modal-close svg {
          width: 1.25rem;
          height: 1.25rem;
        }

        /* 바디 */
        .max-auth-modal-body {
          padding: 2rem;
          flex: 1;
          overflow-y: auto;
        }

        .max-auth-login-section {
          margin-bottom: 1.5rem;
        }

        .max-auth-primary-btn {
          width: 100%;
          font-size: 1rem;
          padding: 1rem 1.5rem;
        }

        /* 구분선 */
        .max-auth-divider {
          position: relative;
          text-align: center;
          margin: 1.5rem 0;
        }

        .max-auth-divider::before {
          content: '';
          position: absolute;
          top: 50%;
          left: 0;
          right: 0;
          height: 1px;
          background: #e5e7eb;
        }

        .max-auth-divider span {
          background: white;
          color: #6b7280;
          padding: 0 1rem;
          font-size: 0.875rem;
          position: relative;
        }

        /* 대체 로그인 섹션 */
        .max-auth-alternate-section {
          text-align: center;
          margin-bottom: 1.5rem;
        }

        .max-auth-alternate-text {
          font-size: 0.875rem;
          color: #6b7280;
          margin: 0 0 0.75rem;
        }

        .max-auth-alternate-btn {
          width: 100%;
        }

        /* 추가 정보 */
        .max-auth-info {
          background: #f9fafb;
          border: 1px solid #e5e7eb;
          border-radius: 0.75rem;
          padding: 1rem;
          margin-top: 1.5rem;
        }

        .max-auth-info-text {
          font-size: 0.8125rem;
          color: #6b7280;
          text-align: center;
          line-height: 1.5;
          margin: 0;
        }

        .max-auth-info-text a {
          color: #4f46e5;
          text-decoration: none;
          font-weight: 500;
        }

        .max-auth-info-text a:hover {
          text-decoration: underline;
        }

        /* 푸터 */
        .max-auth-modal-footer {
          padding: 1rem 2rem 1.5rem;
          border-top: 1px solid #e5e7eb;
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: #f9fafb;
        }

        .max-auth-cancel-btn {
          background: none;
          border: none;
          color: #6b7280;
          cursor: pointer;
          font-size: 0.875rem;
          font-weight: 500;
          padding: 0.5rem 0.75rem;
          border-radius: 0.5rem;
          transition: all 0.2s ease;
        }

        .max-auth-cancel-btn:hover {
          color: #374151;
          background: #f3f4f6;
        }

        .max-auth-cancel-btn:focus {
          outline: 2px solid #4f46e5;
          outline-offset: 2px;
        }

        .max-auth-help-link {
          color: #4f46e5;
          text-decoration: none;
          font-size: 0.8125rem;
          font-weight: 500;
          transition: color 0.2s ease;
        }

        .max-auth-help-link:hover {
          color: #4338ca;
          text-decoration: underline;
        }

        .max-auth-help-link:focus {
          outline: 2px solid #4f46e5;
          outline-offset: 2px;
          border-radius: 0.25rem;
        }

        /* 애니메이션 */
        @keyframes backdropFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes backdropFadeOut {
          from { opacity: 1; }
          to { opacity: 0; }
        }

        @keyframes modalSlideIn {
          from {
            opacity: 0;
            transform: scale(0.95) translateY(-1rem);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }

        @keyframes modalSlideOut {
          from {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
          to {
            opacity: 0;
            transform: scale(0.95) translateY(-1rem);
          }
        }

        /* 반응형 */
        @media (max-width: 640px) {
          .max-auth-modal {
            margin: 0.5rem;
            max-width: none;
            width: calc(100% - 1rem);
          }

          .max-auth-modal-header {
            padding: 1.5rem 1.5rem 1rem;
          }

          .max-auth-modal-body {
            padding: 1.5rem;
          }

          .max-auth-modal-footer {
            padding: 0.75rem 1.5rem 1rem;
            flex-direction: column;
            gap: 0.75rem;
            text-align: center;
          }

          .max-auth-modal-title {
            font-size: 1.25rem;
          }

          .max-auth-modal-description {
            font-size: 0.875rem;
          }

          .max-auth-modal-logo {
            width: 56px;
            height: 56px;
          }

          .max-auth-modal-logo svg {
            width: 28px;
            height: 28px;
          }
        }

        /* 다크 모드 */
        @media (prefers-color-scheme: dark) {
          .max-auth-modal {
            background: #1f2937;
            color: #f9fafb;
          }

          .max-auth-info {
            background: #374151;
            border-color: #4b5563;
          }

          .max-auth-info-text {
            color: #d1d5db;
          }

          .max-auth-modal-footer {
            background: #374151;
            border-color: #4b5563;
          }

          .max-auth-cancel-btn {
            color: #d1d5db;
          }

          .max-auth-cancel-btn:hover {
            color: #f9fafb;
            background: #4b5563;
          }

          .max-auth-divider span {
            background: #1f2937;
            color: #9ca3af;
          }

          .max-auth-alternate-text {
            color: #9ca3af;
          }
        }

        /* 감소된 모션 */
        @media (prefers-reduced-motion: reduce) {
          .max-auth-modal-backdrop,
          .max-auth-modal,
          .max-auth-modal-close,
          .max-auth-cancel-btn,
          .max-auth-help-link {
            animation: none;
            transition: none;
          }
        }

        /* 고대비 모드 */
        @media (prefers-contrast: high) {
          .max-auth-modal {
            border: 2px solid #000;
          }
          
          .max-auth-modal-close,
          .max-auth-cancel-btn {
            border: 1px solid currentColor;
          }
        }
      `}</style>
    </div>,
    document.body
  );
};

export default AuthModal;