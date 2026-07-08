import './App.css';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { BugLogProvider } from './context/BugLogContext';
import LandingScreen from './components/LandingScreen';
import OrdersList from './components/OrdersList';
import OrderBuilder from './components/OrderBuilder';
import SettingsScreen from './components/SettingsScreen';
import BlankOrderFlow from './components/BlankOrderFlow';

export default function App() {
  return (
    <BugLogProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingScreen />} />
          <Route path="/orders" element={<OrdersList />} />
          <Route path="/orders/:orderId" element={<OrderBuilder />} />
          <Route path="/settings" element={<SettingsScreen />} />
          <Route path="/blank-order" element={<BlankOrderFlow />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </BugLogProvider>
  );
}
