import React, { useState, useEffect } from 'react';
import { Hand, Brain, Database, Mic, Play, Settings, BarChart3, Wifi } from 'lucide-react';

interface SensorData {
  thumb: number;
  index: number;
  middle: number;
  ring: number;
  pinky: number;
}

interface SystemStatus {
  current_gesture: string;
  last_phrase: string;
  model_loaded: boolean;
  gesture_map: Record<string, string>;
}

interface DataStats {
  total_samples: number;
  gestures: Record<string, number>;
}

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '/api';

function App() {
  const [sensorData, setSensorData] = useState<SensorData>({
    thumb: 0, index: 0, middle: 0, ring: 0, pinky: 0
  });
  const [systemStatus, setSystemStatus] = useState<SystemStatus>({
    current_gesture: 'none',
    last_phrase: 'Waiting for input...',
    model_loaded: false,
    gesture_map: {}
  });
  const [dataStats, setDataStats] = useState<DataStats>({
    total_samples: 0,
    gestures: {}
  });
  const [selectedGesture, setSelectedGesture] = useState('fist');
  const [isTraining, setIsTraining] = useState(false);
  const [alerts, setAlerts] = useState<Array<{id: number, message: string, type: 'success' | 'error'}>>([]);
  const [isSimulating, setIsSimulating] = useState(true);
  const [backendConnected, setBackendConnected] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const gestureOptions = [
    'fist', 'open_hand', 'peace', 'thumbs_up', 
    'pointing', 'ok_sign', 'call_me', 'rock_on'
  ];

  const showAlert = (message: string, type: 'success' | 'error') => {
    const id = Date.now();
    setAlerts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setAlerts(prev => prev.filter(alert => alert.id !== id));
    }, 5000);
  };

  const fetchWithTimeout = async (url: string, options: RequestInit = {}, timeout = 5000) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  };
  // Simulate sensor data
  useEffect(() => {
    if (!isSimulating) return;
    
    const interval = setInterval(() => {
      setSensorData({
        thumb: Math.random(),
        index: Math.random(),
        middle: Math.random(),
        ring: Math.random(),
        pinky: Math.random()
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isSimulating]);

  // Update system status
  useEffect(() => {
    const updateStatus = async () => {
      try {
        const response = await fetchWithTimeout(`${BACKEND_URL}/current_status`);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        setSystemStatus(data);
        setBackendConnected(true);
        setRetryCount(0);
      } catch (error) {
        setBackendConnected(false);
        setRetryCount(prev => prev + 1);
        
        // Only show error alert on first few failures to avoid spam
        if (retryCount < 3) {
          console.error('Failed to fetch status:', error);
        }
        
        setSystemStatus(prev => ({
          ...prev,
          current_gesture: 'backend_offline',
          last_phrase: 'Backend server not running - Please start Flask app'
        }));
      }
    };

    updateStatus();
    // Increase retry interval if backend is down to reduce spam
    const interval = setInterval(updateStatus, backendConnected ? 2000 : 10000);
    return () => clearInterval(interval);
  }, [backendConnected, retryCount]);

  // Update data stats
  useEffect(() => {
    const updateStats = async () => {
      if (!backendConnected) {
        setDataStats({
          total_samples: 0,
          gestures: {}
        });
        return;
      }
      
      try {
        const response = await fetchWithTimeout(`${BACKEND_URL}/data_stats`);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        setDataStats(data);
      } catch (error) {
        // Only log error if we think backend should be connected
        if (backendConnected) {
          console.error('Failed to fetch stats:', error);
        }
        setDataStats({
          total_samples: 0,
          gestures: {}
        });
      }
    };

    updateStats();
    const interval = setInterval(updateStats, backendConnected ? 5000 : 15000);
    return () => clearInterval(interval);
  }, [backendConnected]);

  const collectSample = async () => {
    if (!backendConnected) {
      showAlert('Backend not connected. Please start the Flask server first.', 'error');
      return;
    }
    
    try {
      const response = await fetchWithTimeout(`${BACKEND_URL}/collect_data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...sensorData,
          gesture_label: selectedGesture
        })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      if (data.status === 'success') {
        showAlert('Sample collected successfully!', 'success');
      } else {
        showAlert(`Error: ${data.message}`, 'error');
      }
    } catch (error) {
      showAlert(`Failed to collect sample: ${error instanceof Error ? error.message : 'Network error'}`, 'error');
    }
  };

  const collectMultipleSamples = async () => {
    if (!backendConnected) {
      showAlert('Backend not connected. Please start the Flask server first.', 'error');
      return;
    }
    
    const samplesPerGesture = 5;
    let totalCollected = 0;
    
    for (const gesture of gestureOptions) {
      for (let i = 0; i < samplesPerGesture; i++) {
        // Generate realistic pattern for this gesture
        generateSpecificGesture(gesture);
        
        // Wait a bit for the UI to update
        await new Promise(resolve => setTimeout(resolve, 200));
        
        try {
          const response = await fetchWithTimeout(`${BACKEND_URL}/collect_data`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...sensorData,
              gesture_label: gesture
            })
          });
          
          if (response.ok) {
            totalCollected++;
          }
        } catch (error) {
          console.error(`Failed to collect sample for ${gesture}:`, error);
        }
      }
    }
    
    showAlert(`Collected ${totalCollected} samples across ${gestureOptions.length} gestures!`, 'success');
  };
  const trainModel = async () => {
    if (!backendConnected) {
      showAlert('Backend not connected. Please start the Flask server first.', 'error');
      return;
    }
    
    setIsTraining(true);
    try {
      const response = await fetchWithTimeout(`${BACKEND_URL}/train_model`, {
        method: 'POST'
      }, 30000); // Longer timeout for training
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      if (data.status === 'success') {
        showAlert('Model trained successfully!', 'success');
      } else {
        showAlert(`Training error: ${data.message}`, 'error');
      }
    } catch (error) {
      showAlert(`Failed to train model: ${error instanceof Error ? error.message : 'Network error'}`, 'error');
    } finally {
      setIsTraining(false);
    }
  };

  const testGesture = async () => {
    if (!backendConnected) {
      showAlert('Backend not connected. Please start the Flask server first.', 'error');
      return;
    }
    
    try {
      const response = await fetchWithTimeout(`${BACKEND_URL}/sensor_data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sensorData)
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      if (data.status === 'success') {
        showAlert(`Predicted: ${data.gesture} - "${data.phrase}"`, 'success');
      } else {
        showAlert(`Prediction error: ${data.message}`, 'error');
      }
    } catch (error) {
      showAlert(`Failed to test gesture: ${error instanceof Error ? error.message : 'Network error'}`, 'error');
    }
  };

  const generateSpecificGesture = (gestureType: string) => {
    // Generate realistic sensor patterns for different gestures
    const patterns: Record<string, SensorData> = {
      fist: { thumb: 0.8, index: 0.9, middle: 0.9, ring: 0.9, pinky: 0.8 },
      open_hand: { thumb: 0.1, index: 0.1, middle: 0.1, ring: 0.1, pinky: 0.1 },
      peace: { thumb: 0.7, index: 0.2, middle: 0.2, ring: 0.8, pinky: 0.8 },
      thumbs_up: { thumb: 0.2, index: 0.8, middle: 0.8, ring: 0.8, pinky: 0.8 },
      pointing: { thumb: 0.6, index: 0.2, middle: 0.8, ring: 0.8, pinky: 0.8 },
      ok_sign: { thumb: 0.6, index: 0.6, middle: 0.2, ring: 0.2, pinky: 0.2 },
      call_me: { thumb: 0.2, index: 0.8, middle: 0.8, ring: 0.8, pinky: 0.2 },
      rock_on: { thumb: 0.8, index: 0.2, middle: 0.8, ring: 0.8, pinky: 0.2 }
    };

    const basePattern = patterns[gestureType] || patterns.fist;
    // Add some noise to make it realistic
    setSensorData({
      thumb: Math.max(0, Math.min(1, basePattern.thumb + (Math.random() - 0.5) * 0.2)),
      index: Math.max(0, Math.min(1, basePattern.index + (Math.random() - 0.5) * 0.2)),
      middle: Math.max(0, Math.min(1, basePattern.middle + (Math.random() - 0.5) * 0.2)),
      ring: Math.max(0, Math.min(1, basePattern.ring + (Math.random() - 0.5) * 0.2)),
      pinky: Math.max(0, Math.min(1, basePattern.pinky + (Math.random() - 0.5) * 0.2))
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Alerts */}
      <div className="fixed top-4 right-4 z-50 space-y-2">
        {alerts.map(alert => (
          <div
            key={alert.id}
            className={`px-4 py-2 rounded-lg shadow-lg ${
              alert.type === 'success' 
                ? 'bg-green-500 text-white' 
                : 'bg-red-500 text-white'
            }`}
          >
            {alert.message}
          </div>
        ))}
      </div>

      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <Hand className="w-12 h-12 text-indigo-600 mr-3" />
            <h1 className="text-4xl font-bold text-gray-800">GestureEcho</h1>
          </div>
          <p className="text-xl text-gray-600">Smart Glove Testing Interface</p>
        </div>

        {/* Status Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Live Gesture Display */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center mb-4">
              <Mic className="w-6 h-6 text-indigo-600 mr-2" />
              <h2 className="text-xl font-semibold">Live Recognition</h2>
            </div>
            
            <div className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-lg p-6 text-center">
              <div className="text-2xl font-bold mb-2">
                {systemStatus.current_gesture.replace('_', ' ').toUpperCase()}
              </div>
              <div className="text-lg opacity-90 italic">
                "{systemStatus.last_phrase}"
              </div>
            </div>
            
            <div className={`mt-4 inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
              backendConnected
                ? systemStatus.model_loaded 
                  ? 'bg-green-100 text-green-800' 
                  : 'bg-yellow-100 text-yellow-800'
                : 'bg-red-100 text-red-800'
            }`}>
              <Wifi className="w-4 h-4 mr-1" />
              {!backendConnected 
                ? 'Backend Offline' 
                : systemStatus.model_loaded 
                  ? 'Model Ready' 
                  : 'Model Not Loaded'
              }
            </div>
          </div>

          {/* Sensor Data Display */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center mb-4">
              <BarChart3 className="w-6 h-6 text-indigo-600 mr-2" />
              <h2 className="text-xl font-semibold">Sensor Data</h2>
            </div>
            
            <div className="grid grid-cols-5 gap-3">
              {Object.entries(sensorData).map(([finger, value]) => (
                <div key={finger} className="text-center">
                  <div className="bg-gray-100 rounded-lg p-3">
                    <div className="text-xs font-medium text-gray-600 uppercase mb-1">
                      {finger}
                    </div>
                    <div className="text-lg font-bold text-indigo-600">
                      {value.toFixed(2)}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setIsSimulating(!isSimulating)}
                className={`px-3 py-1 rounded text-sm font-medium ${
                  isSimulating 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-gray-100 text-gray-800'
                }`}
              >
                {isSimulating ? 'Stop Simulation' : 'Start Simulation'}
              </button>
              <button
                onClick={testGesture}
                className="px-3 py-1 bg-indigo-100 text-indigo-800 rounded text-sm font-medium hover:bg-indigo-200"
              >
                <Play className="w-4 h-4 inline mr-1" />
                Test Prediction
              </button>
            </div>
          </div>
        </div>

        {/* Testing Controls */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Data Collection */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center mb-4">
              <Database className="w-6 h-6 text-indigo-600 mr-2" />
              <h2 className="text-xl font-semibold">Data Collection</h2>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Gesture to Train:
                </label>
                <select
                  value={selectedGesture}
                  onChange={(e) => setSelectedGesture(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  {gestureOptions.map(gesture => (
                    <option key={gesture} value={gesture}>
                      {gesture.replace('_', ' ').toUpperCase()}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => generateSpecificGesture(selectedGesture)}
                  className="flex-1 bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition-colors"
                >
                  <Settings className="w-4 h-4 inline mr-2" />
                  Generate Pattern
                </button>
                <button
                  onClick={collectSample}
                  className="flex-1 bg-indigo-500 text-white px-4 py-2 rounded-lg hover:bg-indigo-600 transition-colors"
                >
                  <Database className="w-4 h-4 inline mr-2" />
                  Collect Sample
                </button>
              </div>
              
              <button
                onClick={collectMultipleSamples}
                className="w-full mt-2 bg-purple-500 text-white px-4 py-2 rounded-lg hover:bg-purple-600 transition-colors"
              >
                <Database className="w-4 h-4 inline mr-2" />
                Auto-Collect Training Data (5 samples per gesture)
              </button>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-indigo-600">
                  {dataStats.total_samples}
                </div>
                <div className="text-sm text-gray-600">Total Samples</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-indigo-600">
                  {Object.keys(dataStats.gestures).length}
                </div>
                <div className="text-sm text-gray-600">Gesture Types</div>
              </div>
            </div>
          </div>

          {/* Model Training */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center mb-4">
              <Brain className="w-6 h-6 text-indigo-600 mr-2" />
              <h2 className="text-xl font-semibold">Model Training</h2>
            </div>
            
            <p className="text-gray-600 mb-4">
              Train the machine learning model with collected data. 
              Collect at least 10 samples total to start training.
            </p>
            
            <button
              onClick={trainModel}
              disabled={isTraining || dataStats.total_samples < 10}
              className={`w-full px-4 py-2 rounded-lg font-medium transition-colors ${
                isTraining || dataStats.total_samples < 10
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-green-500 text-white hover:bg-green-600'
              }`}
            >
              {isTraining ? (
                <>
                  <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full inline mr-2"></div>
                  Training...
                </>
              ) : (
                <>
                  <Brain className="w-4 h-4 inline mr-2" />
                  Train Model
                </>
              )}
            </button>

            {dataStats.total_samples < 10 && (
              <p className="text-sm text-amber-600 mt-2">
                Need {10 - dataStats.total_samples} more samples to train
              </p>
            )}
          </div>
        </div>

        {/* Quick Test Buttons */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Quick Gesture Tests & Model Prediction</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {gestureOptions.map(gesture => (
              <button
                key={gesture}
                onClick={() => generateSpecificGesture(gesture)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium transition-colors"
              >
                {gesture.replace('_', ' ').toUpperCase()}
              </button>
            ))}
          </div>
          
          <div className="mt-4 p-4 bg-gray-50 rounded-lg">
            <h3 className="font-semibold mb-2">Testing Instructions:</h3>
            <ol className="text-sm text-gray-600 space-y-1">
              <li>1. Click "Auto-Collect Training Data" to generate sample data for all gestures</li>
              <li>2. Click "Train Model" to train the machine learning model</li>
              <li>3. Click any gesture button above to simulate that gesture</li>
              <li>4. Click "Test Prediction" to see what the model predicts</li>
              <li>5. Watch the "Live Recognition" card for real-time results</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;