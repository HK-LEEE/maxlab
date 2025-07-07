import React, { useState, useEffect } from 'react';
import { X, AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react';

interface Alarm {
  id: string;
  equipment_code: string;
  equipment_name: string;
  measurement_code: string;
  measurement_desc: string;
  value: number;
  spec_type: 'ABOVE_SPEC' | 'BELOW_SPEC';
  spec_limit: number;
  timestamp: Date;
}

interface AlarmNotificationProps {
  onClose: () => void;
}

export const AlarmNotification: React.FC<AlarmNotificationProps> = ({ onClose }) => {
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [dismissedAlarms, setDismissedAlarms] = useState<Set<string>>(new Set());

  // Load alarms from sessionStorage on mount
  useEffect(() => {
    const storedAlarms = sessionStorage.getItem('specAlarms');
    if (storedAlarms) {
      const parsedAlarms = JSON.parse(storedAlarms).map((alarm: any) => ({
        ...alarm,
        timestamp: new Date(alarm.timestamp)
      }));
      setAlarms(parsedAlarms);
    }

    // Listen for new alarms
    const handleNewAlarm = (event: CustomEvent<Alarm>) => {
      setAlarms(prev => {
        const newAlarms = [...prev];
        const existingIndex = newAlarms.findIndex(
          a => a.equipment_code === event.detail.equipment_code && 
               a.measurement_code === event.detail.measurement_code
        );
        
        if (existingIndex >= 0) {
          newAlarms[existingIndex] = event.detail;
        } else {
          newAlarms.push(event.detail);
        }
        
        // Keep only last 50 alarms
        if (newAlarms.length > 50) {
          newAlarms.shift();
        }
        
        // Store in sessionStorage
        sessionStorage.setItem('specAlarms', JSON.stringify(newAlarms));
        
        return newAlarms;
      });
    };

    window.addEventListener('specAlarm', handleNewAlarm as EventListener);
    return () => window.removeEventListener('specAlarm', handleNewAlarm as EventListener);
  }, []);

  const dismissAlarm = (alarmId: string) => {
    setDismissedAlarms(prev => new Set(prev).add(alarmId));
  };

  const clearAllAlarms = () => {
    setAlarms([]);
    sessionStorage.removeItem('specAlarms');
  };

  const activeAlarms = alarms.filter(alarm => !dismissedAlarms.has(alarm.id));

  if (activeAlarms.length === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 max-w-md z-50">
      <div className="bg-white rounded-lg shadow-lg border border-red-200">
        <div className="flex items-center justify-between p-3 border-b bg-red-50 rounded-t-lg">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-5 h-5 text-red-600" />
            <h3 className="font-semibold text-red-900">Spec Alarms ({activeAlarms.length})</h3>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={clearAllAlarms}
              className="text-xs text-red-600 hover:text-red-800"
            >
              Clear All
            </button>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700"
            >
              <X size={16} />
            </button>
          </div>
        </div>
        
        <div className="max-h-96 overflow-y-auto">
          {activeAlarms.slice(-5).reverse().map((alarm) => (
            <div
              key={alarm.id}
              className="p-3 border-b last:border-b-0 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-2">
                    {alarm.spec_type === 'ABOVE_SPEC' ? (
                      <TrendingUp className="w-4 h-4 text-red-500" />
                    ) : (
                      <TrendingDown className="w-4 h-4 text-orange-500" />
                    )}
                    <span className="font-medium text-sm">
                      {alarm.equipment_name} ({alarm.equipment_code})
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-gray-600">
                    {alarm.measurement_desc}: {alarm.value.toLocaleString()} 
                    {alarm.spec_type === 'ABOVE_SPEC' ? ' > ' : ' < '}
                    {alarm.spec_limit.toLocaleString()}
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    {alarm.timestamp.toLocaleTimeString()}
                  </div>
                </div>
                <button
                  onClick={() => dismissAlarm(alarm.id)}
                  className="ml-2 text-gray-400 hover:text-gray-600"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
        
        {activeAlarms.length > 5 && (
          <div className="p-2 text-center text-xs text-gray-500 border-t">
            Showing latest 5 of {activeAlarms.length} alarms
          </div>
        )}
      </div>
    </div>
  );
};