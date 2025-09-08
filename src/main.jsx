// src/main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';

import App from './App.jsx';
import './index.css';

/* Providers */
import {AuthProvider} from './contexts/AuthContext.jsx';
import {UOMProvider} from './contexts/UOMContext.jsx';
import {AlertProvider} from './contexts/AlertContext.jsx';
import {LocationProvider} from './contexts/LocationContext.jsx';

/* --------------------------------------------------------------------------
 * DEV-ONLY FETCH GUARDS
 * - Hard block ANY `po_bundle_json=cs.` URL (encoded or decoded)
 * - Mute Bitdefender/Aitopia extension network noise on localhost
 * - Warn on /items?select=* (optional noise detector)
 * ------------------------------------------------------------------------ */
if(import.meta.env.DEV&&typeof window!=='undefined'&&typeof window.fetch==='function'){
  const originalFetch=window.fetch.bind(window);

  window.fetch=(input,init)=>{
    const url=typeof input==='string'?input:input?.url||'';

    try{
      const decoded=decodeURIComponent(url);

      // Block ANY cs. filter on po_bundle_json (we only use safe paths now)
      if(/po_bundle_json=cs\./i.test(url)||/po_bundle_json=cs\./i.test(decoded)){
        // eslint-disable-next-line no-console
        console.error('Blocked po_bundle_json cs.* URL',{url,decoded,init,stack:new Error().stack});
        return Promise.reject(new Error('Blocked broken JSONB cs. filter in URL'));
      }

      // Mute noisy Bitdefender/Aitopia calls during dev
      if(/^https:\/\/extensions\.aitopia\.ai\//i.test(url)){
        // eslint-disable-next-line no-console
        console.warn('Dev-guard: blocked Aitopia extension fetch',{url});
        return Promise.reject(new Error('Blocked extension fetch (Aitopia) in dev'));
      }

      // Optional: trace accidental wide selects
      if(url.includes('/rest/v1/items?')&&url.includes('select=*')){
        // eslint-disable-next-line no-console
        console.warn('Who called items?select=*',{url,init,stack:new Error().stack});
      }
    }catch{
      /* never break fetch because of guard parsing */
    }

    return originalFetch(input,init);
  };
}

const root=ReactDOM.createRoot(document.getElementById('root'));

root.render(
  <React.StrictMode>
    <AuthProvider>
      <UOMProvider>
        <AlertProvider>
          <LocationProvider>
            <BrowserRouter basename={import.meta.env.BASE_URL||'/'}>
              <App/>
            </BrowserRouter>
          </LocationProvider>
        </AlertProvider>
      </UOMProvider>
    </AuthProvider>
  </React.StrictMode>
);
