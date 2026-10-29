import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element was not found.');

// Deliberately no StrictMode: the Three.js viewport owns a WebGL renderer and
// must not be mounted twice in development.
ReactDOM.createRoot(root).render(<App />);
