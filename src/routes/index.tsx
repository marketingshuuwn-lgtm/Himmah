import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "نظام الموارد البشرية" },
      {
        name: "description",
        content: "نظام احترافي لإدارة الموظفين والرواتب والعقود الرقمية والتقييمات.",
      },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/auth", search: { next: undefined } });
  },
  component: () => null,
});
