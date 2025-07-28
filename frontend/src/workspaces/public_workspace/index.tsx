import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { 
  Database, 
  Workflow, 
  Monitor, 
  Share, 
  Construction, 
  ChevronRight,
  Activity,
  AlertCircle
} from 'lucide-react';
import { toast } from 'react-hot-toast';

interface TotalMonitoringFeature {
  id: string;
  feature_name: string;
  feature_slug: string;
  display_name: string;
  description: string;
  icon: string;
  color: string;
  route_path: string;
  component_path: string;
  is_implemented: boolean;
  is_active: boolean;
  sort_order: number;
}

const iconMap: Record<string, React.ReactNode> = {
  database: <Database size={24} />,
  workflow: <Workflow size={24} />,
  monitor: <Monitor size={24} />,
  share: <Share size={24} />,
  activity: <Activity size={24} />,
};

const PublicWorkspace: React.FC = () => {
  const { feature } = useParams<{ feature?: string }>();
  const navigate = useNavigate();
  const [selectedFeature, setSelectedFeature] = useState<TotalMonitoringFeature | null>(null);

  // Fetch Total Monitoring features
  const { data: features, isLoading, error } = useQuery<TotalMonitoringFeature[]>({
    queryKey: ['totalMonitoringFeatures'],
    queryFn: async () => {
      const response = await fetch('/api/v1/total-monitoring/features');
      if (!response.ok) {
        throw new Error('Failed to load features');
      }
      return response.json();
    },
  });

  // Handle feature selection from URL
  useEffect(() => {
    if (feature && features) {
      const matchedFeature = features.find(f => f.feature_slug === feature);
      if (matchedFeature) {
        setSelectedFeature(matchedFeature);
      } else {
        navigate('/workspaces/public_workspace');
      }
    } else {
      setSelectedFeature(null);
    }
  }, [feature, features, navigate]);

  const handleFeatureClick = (selectedFeature: TotalMonitoringFeature) => {
    if (!selectedFeature.is_implemented) {
      toast.error('This feature is currently under development');
      return;
    }
    
    navigate(`/workspaces/public_workspace/${selectedFeature.feature_slug}`);
  };

  const renderFeatureCard = (feature: TotalMonitoringFeature) => {
    const icon = iconMap[feature.icon] || <Activity size={24} />;
    const isImplemented = feature.is_implemented;
    
    return (
      <div
        key={feature.id}
        className={`
          relative p-6 rounded-lg border transition-all duration-200 cursor-pointer
          ${isImplemented 
            ? 'bg-white border-gray-200 hover:border-gray-300 hover:shadow-lg' 
            : 'bg-gray-50 border-gray-200 opacity-75'
          }
        `}
        onClick={() => handleFeatureClick(feature)}
      >
        {/* Under Development Badge */}
        {!isImplemented && (
          <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded-full">
            <Construction size={12} />
            <span>Under Development</span>
          </div>
        )}
        
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <div 
              className={`p-3 rounded-lg ${isImplemented ? 'bg-blue-50' : 'bg-gray-100'}`}
              style={{ color: isImplemented ? feature.color : '#6B7280' }}
            >
              {icon}
            </div>
            
            <div className="flex-1">
              <h3 className={`text-lg font-semibold ${isImplemented ? 'text-gray-900' : 'text-gray-500'}`}>
                {feature.display_name}
              </h3>
              <p className={`text-sm mt-1 ${isImplemented ? 'text-gray-600' : 'text-gray-400'}`}>
                {feature.description}
              </p>
              
              {!isImplemented && (
                <div className="flex items-center gap-1 mt-2 text-xs text-yellow-600">
                  <AlertCircle size={12} />
                  <span>Implementation in progress</span>
                </div>
              )}
            </div>
          </div>
          
          {isImplemented && (
            <ChevronRight size={20} className="text-gray-400" />
          )}
        </div>
      </div>
    );
  };

  const renderSelectedFeature = () => {
    if (!selectedFeature) return null;
    
    // Dynamic component loading would go here
    // For now, show a placeholder
    return (
      <div className="p-8 bg-white rounded-lg border border-gray-200">
        <div className="flex items-center gap-3 mb-6">
          <div 
            className="p-3 rounded-lg bg-blue-50"
            style={{ color: selectedFeature.color }}
          >
            {iconMap[selectedFeature.icon] || <Activity size={24} />}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {selectedFeature.display_name}
            </h1>
            <p className="text-gray-600">{selectedFeature.description}</p>
          </div>
        </div>
        
        {/* Feature component would be rendered here */}
        <div className="p-12 bg-gray-50 rounded-lg text-center">
          <Construction size={48} className="mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-semibold text-gray-700 mb-2">
            Component Under Development
          </h3>
          <p className="text-gray-500">
            This feature component will be implemented according to the latest design patterns.
          </p>
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="p-8 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">Loading Total Monitoring features...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center">
        <AlertCircle size={48} className="mx-auto text-red-500 mb-4" />
        <h3 className="text-lg font-semibold text-red-700 mb-2">Failed to load features</h3>
        <p className="text-red-600">Please check your connection and try again.</p>
      </div>
    );
  }

  if (selectedFeature) {
    return renderSelectedFeature();
  }

  return (
    <div className="max-w-6xl mx-auto p-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg">
            <Monitor size={32} className="text-blue-600" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Total Monitoring</h1>
            <p className="text-gray-600">
              Comprehensive system monitoring with dynamic database connections and real-time process flows
            </p>
          </div>
        </div>
        
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <Activity size={20} className="text-blue-600 mt-0.5" />
            <div>
              <h3 className="font-semibold text-blue-900">Group-Based Monitoring</h3>
              <p className="text-sm text-blue-700 mt-1">
                All data is isolated by group ID (UUID). Users see only their group's data, 
                while administrators have access to all groups.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Features Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {features?.map(renderFeatureCard)}
      </div>

      {/* Footer Info */}
      <div className="mt-12 p-6 bg-gray-50 rounded-lg">
        <h3 className="font-semibold text-gray-900 mb-3">System Features</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600">
          <div className="flex items-center gap-2">
            <Database size={16} />
            <span>Encrypted database connections</span>
          </div>
          <div className="flex items-center gap-2">
            <Workflow size={16} />
            <span>ReactFlow-based process design</span>
          </div>
          <div className="flex items-center gap-2">
            <Monitor size={16} />
            <span>Real-time monitoring with WebSocket</span>
          </div>
          <div className="flex items-center gap-2">
            <Share size={16} />
            <span>Public sharing without authentication</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PublicWorkspace;