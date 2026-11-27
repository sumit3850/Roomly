import { Suspense } from 'react'
import { lazyWithReload as lazy } from '@/lib/lazyWithReload'
import { ErrorBoundary } from '@/components/layout/ErrorBoundary'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { AppLayout } from '@/components/layout/AppLayout'
import { GuestOnly, RequireAuth } from '@/components/layout/RequireAuth'
import { Spinner } from '@/components/ui/misc'
import { ScrollToTop } from '@/components/layout/ScrollToTop'

const Home = lazy(() => import('@/pages/Home'))
const SignUp = lazy(() => import('@/pages/auth/SignUp'))
const Login = lazy(() => import('@/pages/auth/Login'))
const VerifyEmail = lazy(() => import('@/pages/auth/VerifyEmail'))
const VerifyPhone = lazy(() => import('@/pages/auth/VerifyPhone'))
const ForgotPassword = lazy(() => import('@/pages/auth/ForgotPassword'))
const ResetPassword = lazy(() => import('@/pages/auth/ResetPassword'))
const AuthCallback = lazy(() => import('@/pages/auth/AuthCallback'))
const Search = lazy(() => import('@/pages/Search'))
const PropertyDetails = lazy(() => import('@/pages/PropertyDetails'))
const MapSearch = lazy(() => import('@/pages/MapSearch'))
const AddProperty = lazy(() => import('@/pages/AddProperty'))
const EditProperty = lazy(() => import('@/pages/EditProperty'))
const OwnerDashboard = lazy(() => import('@/pages/OwnerDashboard'))
const TenantDashboard = lazy(() => import('@/pages/TenantDashboard'))
const Profile = lazy(() => import('@/pages/Profile'))
const Saved = lazy(() => import('@/pages/Saved'))
const MyEnquiries = lazy(() => import('@/pages/MyEnquiries'))
const NewspaperArchive = lazy(() => import('@/pages/NewspaperArchive'))
const AdminDashboard = lazy(() => import('@/pages/admin/AdminDashboard'))
const Help = lazy(() => import('@/pages/Help'))
const NotFound = lazy(() => import('@/pages/NotFound'))

function DashboardRedirect() {
  const { isOwner } = useAuth()
  return <Navigate to={isOwner ? '/dashboard/owner' : '/dashboard/tenant'} replace />
}

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '') || '/'}>
      <AuthProvider>
        <ScrollToTop />
        <ErrorBoundary>
        <Suspense fallback={<Spinner />}>
          <Routes>
            <Route element={<AppLayout />}>
              <Route index element={<Home />} />
              <Route path="search" element={<Search />} />
              <Route path="map" element={<MapSearch />} />
              <Route path="property/:id" element={<PropertyDetails />} />
              <Route path="newspaper" element={<NewspaperArchive />} />
              <Route path="help" element={<Help />} />

              <Route path="signup" element={<GuestOnly><SignUp /></GuestOnly>} />
              <Route path="login" element={<GuestOnly><Login /></GuestOnly>} />
              <Route path="forgot-password" element={<ForgotPassword />} />
              <Route path="verify-email" element={<VerifyEmail />} />
              <Route path="verify-phone" element={<VerifyPhone />} />
              <Route path="reset-password" element={<ResetPassword />} />
              <Route path="auth/callback" element={<AuthCallback />} />

              <Route path="dashboard" element={<RequireAuth><DashboardRedirect /></RequireAuth>} />
              <Route path="dashboard/tenant" element={<RequireAuth><TenantDashboard /></RequireAuth>} />
              <Route path="dashboard/owner" element={<RequireAuth anyOwner><OwnerDashboard /></RequireAuth>} />
              <Route path="properties/new" element={<RequireAuth anyOwner><AddProperty /></RequireAuth>} />
              <Route path="properties/:id/edit" element={<RequireAuth anyOwner><EditProperty /></RequireAuth>} />
              <Route path="profile" element={<RequireAuth><Profile /></RequireAuth>} />
              <Route path="saved" element={<RequireAuth><Saved /></RequireAuth>} />
              <Route path="enquiries" element={<RequireAuth><MyEnquiries /></RequireAuth>} />
              <Route path="admin" element={<RequireAuth roles={['admin']}><AdminDashboard /></RequireAuth>} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </Suspense>
        </ErrorBoundary>
        <Toaster richColors position="top-center" closeButton />
      </AuthProvider>
    </BrowserRouter>
  )
}
