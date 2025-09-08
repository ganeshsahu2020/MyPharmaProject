// src/components/TailwindTest.jsx
import React from 'react';

const TailwindTest = () => {
  console.log('✅ TailwindTest Loaded');
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-blue-600 text-white text-center p-10 rounded-2xl shadow-xl">
        <h1 className="text-3xl font-bold mb-4">Tailwind CSS Test</h1>
        <p className="text-lg">
          🎨 If this box is blue with rounded corners, Tailwind is working!
        </p>
      </div>
    </div>
  );
};

export default TailwindTest;
