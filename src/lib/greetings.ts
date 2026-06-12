export interface GreetingData {
  criticalAlerts: number;
  healthScore: number;
}

export function getContextualGreeting(data: GreetingData): { message: string; colorClass: string } {
  if (data.criticalAlerts > 0) {
    const isSingle = data.criticalAlerts === 1;
    return {
      message: `${data.criticalAlerts} critical issue${isSingle ? '' : 's'} need${isSingle ? 's' : ''} your attention`,
      colorClass: "text-red-400"
    };
  }

  if (data.healthScore < 90) {
    return {
      message: "Everything's mostly healthy — a few things to check",
      colorClass: "text-amber-500"
    };
  }

  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) {
    return { message: "Good morning, all systems healthy", colorClass: "text-emerald-400" };
  } else if (hour >= 12 && hour < 17) {
    return { message: "Good afternoon, everything looks good", colorClass: "text-emerald-400" };
  } else {
    return { message: "Good evening, all clear", colorClass: "text-emerald-400" };
  }
}
