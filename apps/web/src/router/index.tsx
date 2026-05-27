/* eslint-disable react-refresh/only-export-components */
import { lazy } from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppShell } from '../layout/AppShell'
import { PageFallback } from '../components/PageFallback'

const RunLivePage = lazy(() => import('../pages/RunLivePage').then((m) => ({ default: m.RunLivePage })))
const PatchReviewPage = lazy(() => import('../pages/PatchReviewPage').then((m) => ({ default: m.PatchReviewPage })))
const FilesPage = lazy(() => import('../pages/FilesPage').then((m) => ({ default: m.FilesPage })))
const MemoryPage = lazy(() => import('../pages/MemoryPage').then((m) => ({ default: m.MemoryPage })))
const CostPage = lazy(() => import('../pages/CostPage').then((m) => ({ default: m.CostPage })))
const EvalPage = lazy(() => import('../pages/EvalPage').then((m) => ({ default: m.EvalPage })))
const HistoryPage = lazy(() => import('../pages/HistoryPage').then((m) => ({ default: m.HistoryPage })))

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/workspace/live" replace /> },
      {
        path: 'workspace',
        children: [
          { index: true, element: <Navigate to="live" replace /> },
          {
            path: 'live',
            element: (
              <PageFallback>
                <RunLivePage />
              </PageFallback>
            ),
          },
          {
            path: 'patch',
            element: (
              <PageFallback>
                <PatchReviewPage />
              </PageFallback>
            ),
          },
          {
            path: 'files',
            element: (
              <PageFallback>
                <FilesPage />
              </PageFallback>
            ),
          },
          {
            path: 'memory',
            element: (
              <PageFallback>
                <MemoryPage />
              </PageFallback>
            ),
          },
          {
            path: 'history',
            element: (
              <PageFallback>
                <HistoryPage />
              </PageFallback>
            ),
          },
        ],
      },
      {
        path: 'dashboard',
        children: [
          { index: true, element: <Navigate to="cost" replace /> },
          {
            path: 'cost',
            element: (
              <PageFallback>
                <CostPage />
              </PageFallback>
            ),
          },
          {
            path: 'eval',
            element: (
              <PageFallback>
                <EvalPage />
              </PageFallback>
            ),
          },
        ],
      },
      {
        path: 'runs/:runId',
        element: (
          <PageFallback>
            <RunLivePage />
          </PageFallback>
        ),
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])
