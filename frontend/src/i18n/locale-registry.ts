import {
  dateEnUS,
  datePtBR,
  enUS,
  ptBR,
} from 'naive-ui'

import type { NDateLocale, NLocale } from 'naive-ui'

type NaiveLocaleConfig = {
  locale: NLocale
  dateLocale: NDateLocale
}

type LocaleRegistryEntry = {
  locale: string
  label: string
  browserMatches: string[]
  naive: NaiveLocaleConfig
  turnstileLocale: string
}

export const LOCALE_REGISTRY = [
  {
    locale: 'en',
    label: 'English',
    browserMatches: ['en'],
    naive: { locale: enUS, dateLocale: dateEnUS },
    turnstileLocale: 'en',
  },
  {
    locale: 'pt-BR',
    label: 'Português (Brasil)',
    browserMatches: ['pt'],
    naive: { locale: ptBR, dateLocale: datePtBR },
    turnstileLocale: 'pt-BR',
  },
] as const satisfies readonly LocaleRegistryEntry[]

export type SupportedLocale = (typeof LOCALE_REGISTRY)[number]['locale']

export const SUPPORTED_LOCALES = LOCALE_REGISTRY.map(({ locale }) => locale) as SupportedLocale[]

const localeRegistryMap = Object.fromEntries(
  LOCALE_REGISTRY.map((entry) => [entry.locale, entry]),
) as Record<SupportedLocale, (typeof LOCALE_REGISTRY)[number]>

export const getLocaleRegistryEntry = (locale: SupportedLocale) => {
  return localeRegistryMap[locale]
}

export const getLocaleLabel = (locale: SupportedLocale) => {
  return getLocaleRegistryEntry(locale).label
}

export const getLocaleOptions = () => {
  return LOCALE_REGISTRY.map(({ locale, label }) => ({
    label,
    value: locale,
    key: locale,
  }))
}

export const getNaiveLocaleConfig = (locale: SupportedLocale) => {
  return getLocaleRegistryEntry(locale).naive
}

export const getTurnstileLocale = (locale: SupportedLocale) => {
  return getLocaleRegistryEntry(locale).turnstileLocale
}
