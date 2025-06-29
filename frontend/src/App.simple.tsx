import React from 'react';
import '@/styles/index.css';

function SimpleApp() {
  return (
    <div className="min-h-screen bg-white p-8">
      <h1 className="text-2xl font-bold text-black">Query Hub - Test</h1>
      <p className="mt-4 text-gray-600">If you can see this, the app is loading correctly.</p>
      <button className="mt-4 btn-primary">Test Button</button>
    </div>
  );
}

export default SimpleApp;