import { PrismaClient } from "@prisma/client";
import type { InputField } from "../lib/types";

const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.skill.count();
  if (existing > 0) {
    console.log("Skills already exist, skipping seed.");
    return;
  }

  const inputSchema: InputField[] = [
    {
      key: "period",
      label: "Reporting period",
      type: "text",
      required: true,
      placeholder: "e.g. Q3 2026, or Sep 1-14",
    },
    {
      key: "focus",
      label: "Anything to focus on?",
      type: "textarea",
      required: false,
      placeholder: "Optional — a region, a product line, a metric to highlight",
    },
  ];

  await prisma.skill.create({
    data: {
      name: "Weekly Sales PDF Report",
      description:
        "Generates a PDF summarizing sales performance for the period you give it — " +
        "pulled from the boss's Instagram post about a Claude reporting skill.",
      status: "draft",
      needsInput: true,
      usesCowork: false,
      promptTemplate:
        "Generate a PDF sales report for {{period}}. Include revenue, top products, and " +
        "trend vs. the previous period. {{focus}}",
      inputSchema: JSON.stringify(inputSchema),
      sourcePost:
        "(example) Just found this Claude skill — paste your sales numbers and it spits out " +
        "a clean PDF report in minutes. Game changer for weekly reviews.",
    },
  });

  console.log("Seeded 1 example skill (draft).");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
