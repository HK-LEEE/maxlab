import React from 'react';

interface OAuthLoginGuideProps {
  error: string;
  onRetry: () => void;
}

export const OAuthLoginGuide: React.FC<OAuthLoginGuideProps> = ({ error, onRetry }) => {
  const isLoginRequiredError = error.includes('login_required') || 
                              error.includes('Force re-authentication required');

  if (!isLoginRequiredError) return null;

  return (
    <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
      <h3 className="text-sm font-medium text-yellow-800 mb-2">
        다른 사용자로 로그인하려면
      </h3>
      <ol className="text-sm text-yellow-700 space-y-1 list-decimal list-inside">
        <li>
          <a 
            href="http://localhost:8000" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-yellow-800 underline hover:text-yellow-900"
          >
            MAX Platform
          </a>
          에서 먼저 로그아웃하세요
        </li>
        <li>이 창으로 돌아와서 다시 로그인을 시도하세요</li>
      </ol>
      <button
        onClick={onRetry}
        className="mt-3 text-sm bg-yellow-600 text-white px-4 py-2 rounded hover:bg-yellow-700 transition-colors"
      >
        다시 시도
      </button>
    </div>
  );
};