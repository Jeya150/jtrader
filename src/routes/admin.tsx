import {createFileRoute, useNavigate} from '@tanstack/react-router';
import {useEffect, useState} from 'react';
import Admin from '../components/admin-dashboard';

const api = (path: string) => fetch(path).then(async response => {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Error(data.error || 'Request failed');
  return data;
});

export const Route = createFileRoute('/admin')({component: PrivateAdmin});

function PrivateAdmin() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    api('/api/auth').then(data => {
      if (data?.user?.role === 'admin') {
        setAuthorized(true);
      } else if (data?.user) {
        navigate({to: '/'});
      }
    }).catch(() => navigate({to: '/'})).finally(() => setChecking(false));
  }, [navigate]);

  if (checking) return <div className="privateRouteState">Checking admin access...</div>;
  if (!authorized) return <Admin in={false} close={() => navigate({to: '/'})}/>;
  return <Admin in close={() => navigate({to: '/'})}/>;
}
