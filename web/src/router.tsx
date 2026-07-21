import { createBrowserRouter, Outlet } from "react-router-dom";

import { AnalyticsTracker } from "@/components/layout/analytics-tracker";
import { AdminRoute, ProtectedRoute } from "@/components/layout/protected-route";
import UserLayout from "@/layouts/user-layout";
import AssetsPage from "@/pages/assets";
import CanvasPage from "@/pages/canvas";
import CanvasProjectPage from "@/pages/canvas/project";
import ConfigPage from "@/pages/config";
import HomePage from "@/pages/home";
import ImagePage from "@/pages/image";
import LoginPage from "@/pages/login";
import NotFound from "@/pages/not-found";
import PromptsPage from "@/pages/prompts";
import VideoPage from "@/pages/video";

export const router = createBrowserRouter([
    { path: "/login", element: <LoginPage /> },
    {
        element: (
            <ProtectedRoute>
                <UserLayout>
                    <AnalyticsTracker />
                    <Outlet />
                </UserLayout>
            </ProtectedRoute>
        ),
        children: [
            { path: "/", element: <HomePage /> },
            { path: "/image", element: <ImagePage /> },
            { path: "/video", element: <VideoPage /> },
            { path: "/assets", element: <AssetsPage /> },
            { path: "/prompts", element: <PromptsPage /> },
            { path: "/canvas", element: <CanvasPage /> },
            { path: "/canvas/:id", element: <CanvasProjectPage /> },
            {
                path: "/config",
                element: (
                    <AdminRoute>
                        <ConfigPage />
                    </AdminRoute>
                ),
            },
        ],
    },
    { path: "*", element: <NotFound /> },
]);
