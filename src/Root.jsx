import { Suspense, lazy } from 'react'
import App from './App.jsx'

const Admin = lazy(() => import('./admin/Admin.jsx'))

export default function Root() {
  const path = window.location.pathname
  if (path !== '/admin' && !path.startsWith('/admin/')) return <App />
  return (
    <Suspense fallback={null}>
      <Admin />
    </Suspense>
  )
}
