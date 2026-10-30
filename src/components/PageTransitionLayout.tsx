import { Outlet, useLocation } from 'react-router-dom';

export function PageTransitionLayout() {
  const { pathname } = useLocation();
  return (
    <div key={pathname} className="page-enter h-dvh">
      <Outlet />
    </div>
  );
}
