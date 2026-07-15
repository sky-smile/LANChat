import { Routes, Route } from 'react-router-dom';
import Login from './components/Login';
import Chat from './components/Chat';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Chat />} />
      </Route>
    </Routes>
  );
}

export default App;
