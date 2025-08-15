import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useAlerts } from '../contexts/AlertContext';
import { Alert, AlertDescription, AlertTitle as AlertTitleComponent } from './ui/alert';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { AlertCircle } from 'lucide-react';

const Dashboard = () => {
  const { user, session, role, passwordWarning } = useAuth();
  const { alerts } = useAlerts();
  const alertCount = alerts.length;
  const [openModule, setOpenModule] = useState(null);

  const navModules = [
    {
      name: 'Masters',
      submodules: [
        'Plant Master',
        'SubPlant Master',
        'Department Master',
        'Area Master',
        'Location Master',
        'Equipment Master',
        'Uom Master',
        'Product Master',
        'Material Master',
      ],
    },
    {
      name: 'User Authorization',
      submodules: ['User Management', 'Role Management', 'Password Management'],
    },
    {
      name: 'Document Management',
      submodules: ['Log Books', 'Check Lists', 'Label Master'],
    },
    {
      name: 'Material Inward',
      submodules: [
        'Gate Entry',
        'Vehicle Inspection',
        'Material Inspection',
        'Weight Capture',
        'GRN Posting',
        'Label Printing',
        'Palletization',
      ],
    },
    {
      name: 'Sampling',
      submodules: ['Area Assignment', 'Sampling', 'Stage Out', 'Relocate to WH'],
    },
    {
      name: 'Weighing Balance',
      submodules: ['WeightBox Master', 'StandardWeight Master'],
    },
  ];

  const toggleModule = (idx) => {
    setOpenModule(openModule === idx ? null : idx);
  };

  return (
    <div className="flex-1 overflow-auto bg-white">
      {passwordWarning && (
        <Alert variant="warning" className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <CardTitle>Password Warning</CardTitle>
          <AlertDescription>{passwordWarning}</AlertDescription>
        </Alert>
      )}
      <div className="w-full px-4 md:px-8 py-6">
        <Card className="max-w-6xl mx-auto">
          <CardHeader>
            <CardTitle className="text-2xl font-bold text-blue-700">Dashboard</CardTitle>
          </CardHeader>
          <CardContent>
            {session?.user?.email && (
              <Card className="mb-6 bg-gray-100 border">
                <CardContent className="pt-6">
                  <p>
                    <strong>Email:</strong> {session.user.email}
                  </p>
                  <p>
                    <strong>Role:</strong> {role || 'N/A'}
                  </p>
                </CardContent>
              </Card>
            )}
            {alertCount > 0 && (
              <Alert variant="warning" className="mb-6">
                <AlertCircle className="h-4 w-4" />
                <AlertTitleComponent>Upcoming Stamping Alerts</AlertTitleComponent>
                <AlertDescription>
                  <ul className="list-disc ml-5 text-sm">
                    {alerts.map((a) => (
                      <li key={a.id}>
                        <strong>[{a.source}]</strong> {a.weightbox_id}{' '}
                        {a.standard_weight_id ? `- ${a.standard_weight_id}` : ''}{' '}
                        {a.area ? `- ${a.area}` : ''} - Due in {a.days_left} days ({a.due_on})
                      </li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
            <div className="space-y-3">
              {navModules.map((mod, idx) => (
                <Card key={idx} className="bg-gray-100 shadow-sm">
                  <Button
                    variant="ghost"
                    className="w-full flex justify-between items-center px-4 py-2 rounded-t-lg bg-blue-100"
                    onClick={() => toggleModule(idx)}
                  >
                    <span className="font-bold text-blue-700">{mod.name}</span>
                    <span className="text-blue-700">{openModule === idx ? '−' : '+'}</span>
                  </Button>
                  {openModule === idx && (
                    <div className="p-3 space-y-1">
                      {mod.submodules.map((sub, sidx) => {
                        const path = `/${mod.name.toLowerCase().replace(/\s+/g, '-')}/${sub.toLowerCase().replace(/\s+/g, '-')}`;
                        const isAlerted = (sub === 'WeightBox Master' || sub === 'StandardWeight Master') && alertCount > 0;
                        return (
                          <div key={sidx} className="flex items-center justify-between rounded px-3 py-1 hover:bg-gray-200">
                            <Link to={path} className="text-blue-700 hover:underline text-sm flex-1">
                              {sub}
                            </Link>
                            {isAlerted && (
                              <span className="ml-2 bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                                {alertCount}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;