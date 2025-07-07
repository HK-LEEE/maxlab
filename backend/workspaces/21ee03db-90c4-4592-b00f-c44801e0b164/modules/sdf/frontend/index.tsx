import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const SdfPage: React.FC = () => {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Sdf</h1>
      
      <Card>
        <CardHeader>
          <CardTitle>Welcome to Sdf</CardTitle>
        </CardHeader>
        <CardContent>
          <p>This is your MVP module. Start building your functionality here.</p>
        </CardContent>
      </Card>
    </div>
  );
};

export default SdfPage;
