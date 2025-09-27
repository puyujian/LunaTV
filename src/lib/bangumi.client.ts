'use client';

export interface BangumiCalendarData {
  weekday: {
    en: string;
  };
  items: {
    id: number;
    name: string;
    name_cn: string;
    rating: {
      score: number;
    };
    air_date: string;
    images: {
      large: string;
      common: string;
      medium: string;
      small: string;
      grid: string;
    };
  }[];
}

export async function GetBangumiCalendarData(): Promise<BangumiCalendarData[]> {
  const response = await fetch('https://api.bgm.tv/calendar');
  const data = await response.json();

  // 过滤掉没有图片的项目，防止首页崩溃
  return data.map((day: BangumiCalendarData) => ({
    ...day,
    items: day.items.filter((item) => item.images && item.images.large),
  }));
}
