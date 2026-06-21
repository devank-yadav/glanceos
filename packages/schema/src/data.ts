import { z } from "zod";

// Shapes the server's widget fetchers produce and the screen renders.
// A fetcher that fails returns null for its widget — screens must cope.

export const WeatherData = z.object({
  temperatureC: z.number(),
  summary: z.string(),
  high: z.number().optional(),
  low: z.number().optional(),
});

export const CalendarEvent = z.object({
  start: z.string(), // ISO 8601
  end: z.string().optional(),
  title: z.string(),
  allDay: z.boolean().default(false),
  location: z.string().optional(), // v5.0 — for "Up Next" + "Leave By"
});

export const CalendarData = z.object({
  events: z.array(CalendarEvent),
  error: z.string().optional(),
});

export const TaskItem = z.object({
  id: z.number().int(),
  text: z.string(),
  done: z.boolean(),
});

export const TasksData = z.object({
  items: z.array(TaskItem),
});

export const QueueData = z.object({
  title: z.string(),
  nowServing: z.number().int().nonnegative(),
  waiting: z.number().int().nonnegative(),
});

export type WeatherDataT = z.infer<typeof WeatherData>;
export type CalendarEventT = z.infer<typeof CalendarEvent>;
export type CalendarDataT = z.infer<typeof CalendarData>;
export type TaskItemT = z.infer<typeof TaskItem>;
export type TasksDataT = z.infer<typeof TasksData>;
export type QueueDataT = z.infer<typeof QueueData>;

// ===== v0.6 live-data shapes (server fetchers produce these; null on failure,
// or an `error` string the screen renders as a calm one-line placeholder). =====
export interface ForecastDataT {
  days: Array<{ day: string; hi: number; lo: number; summary: string }>;
}
export interface WindDataT {
  speed: number;
  deg: number;
  dir: string;
}
export interface UvDataT {
  value: number;
  level: string;
}
export interface AirQualityDataT {
  pm25: number;
  aqi: number;
  level: string;
}
export interface PrecipDataT {
  probability: number;
  summary: string;
}
export interface HeadlinesDataT {
  items: string[];
  error?: string;
}
export interface CurrencyDataT {
  from: string;
  to: string;
  rate: number;
  date: string;
}
export interface CryptoDataT {
  coin: string;
  vs: string;
  price: number;
  change?: number;
}
export interface OnThisDayDataT {
  items: Array<{ year: number; text: string }>;
}
export interface WikiDataT {
  title: string;
  extract: string;
}
export interface QuoteLiveDataT {
  text: string;
  author: string;
}
export interface FactDataT {
  text: string;
}
export interface HeadlineListT {
  items: string[];
}
export interface GithubDataT {
  name: string;
  metric: string;
  value: number;
}
export interface HolidayDataT {
  name: string;
  date: string;
  daysUntil: number;
}
export interface IssDataT {
  latitude: number;
  longitude: number;
}
export interface JsonFeedDataT {
  lines: string[];
  error?: string;
}
export interface CustomDataT {
  value?: string | number | boolean | Record<string, unknown> | unknown[];
  error?: string;
}
