import type { ReactNode } from "react";
import { useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { LoaderCircle } from "lucide-react";

import { useAuthStore } from "@/stores/use-auth-store";

export function ProtectedRoute({ children }: { children: ReactNode }) {
    const location = useLocation();
    const status = useAuthStore((state) => state.status);
    const initialize = useAuthStore((state) => state.initialize);

    useEffect(() => {
        void initialize();
    }, [initialize]);

    if (status === "loading") {
        return (
            <main className="flex h-dvh items-center justify-center bg-background text-stone-500">
                <LoaderCircle className="size-5 animate-spin" />
            </main>
        );
    }
    if (status === "anonymous") return <Navigate to="/login" replace state={{ from: location.pathname }} />;
    return <>{children}</>;
}

export function AdminRoute({ children }: { children: ReactNode }) {
    const user = useAuthStore((state) => state.user);
    return user?.role === "admin" ? <>{children}</> : <Navigate to="/canvas" replace />;
}
