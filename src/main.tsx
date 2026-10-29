import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
// Stylesheet order is deliberate: tokens first (every other sheet reads them),
// then the face, then the shell, then the primitives the shell already uses.
import './styles/tokens.css';
import './styles/fonts.css';
import './styles/base.css';
import './styles/primitives.css';
import './styles/menu.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Fieldbound root element #root was not found.');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
