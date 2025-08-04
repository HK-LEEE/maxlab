/**
 * Session Logout Modal Wrapper
 * Provides a simple way to integrate the session logout modal with useSecureLogout hook
 */

import React from 'react';
import { SessionLogoutModal } from './SessionLogoutModal';
import { useSessionLogout } from '../../hooks/useSessionLogout';

export const SessionLogoutModalWrapper: React.FC = () => {
  const sessionLogout = useSessionLogout();
  
  console.log('🔓 SessionLogoutModalWrapper: Rendered with modal state:', sessionLogout.isModalOpen);

  return (
    <SessionLogoutModal
      isOpen={sessionLogout.isModalOpen}
      onClose={sessionLogout.closeModal}
      sessionsData={sessionLogout.sessionsData}
      isLoading={sessionLogout.isLoading}
      onLogout={sessionLogout.executeLogout}
      fetchActiveSessions={sessionLogout.fetchActiveSessions}
    />
  );
};