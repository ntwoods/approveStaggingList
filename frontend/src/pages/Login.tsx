import { GoogleLogin } from "@react-oauth/google";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-hero-gradient px-6 py-12">
      <div className="absolute -left-16 top-20 h-56 w-56 rounded-full bg-brand-200/70 blur-3xl" />
      <div className="absolute right-8 top-8 h-72 w-72 rounded-full bg-brand-300/70 blur-3xl" />
      <div className="absolute bottom-10 left-1/3 h-64 w-64 rounded-full bg-sky-200/60 blur-3xl" />

      <div className="glass-card relative z-10 w-full max-w-md p-8 md:p-10">
        <div className="flex flex-col gap-2">
          <span className="text-xs uppercase tracking-[0.4em] text-brand-700">NTW</span>
          <h1 className="text-3xl font-semibold text-ink-900">Approvals Portal</h1>
          <p className="text-sm text-ink-600">
            Sign in with your authorized account to review pending order documents.
          </p>
        </div>

        <div className="mt-8 flex flex-col gap-5">
          <GoogleLogin
            onSuccess={(credentialResponse) => {
              if (credentialResponse.credential) {
                login(credentialResponse.credential);
                navigate("/dashboard", { replace: true });
              }
            }}
            onError={() => {
              // Fallback is handled by the dashboard with token verification.
            }}
            width="100%"
            theme="outline"
            text="signin_with"
            shape="pill"
          />

          <div className="ghost-panel p-4 text-xs text-ink-600">
            <p className="font-semibold text-ink-700">Authorized users only</p>
            <p className="mt-1">ea01@ntwoods.com or ea02@ntwoods.com</p>
          </div>
        </div>
      </div>
    </div>
  );
}
