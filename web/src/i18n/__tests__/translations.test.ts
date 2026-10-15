/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { createInstance } from 'i18next'
import { describe, expect, test } from 'vitest'

import en from '../locales/en.json'
import fr from '../locales/fr.json'
import ja from '../locales/ja.json'
import ru from '../locales/ru.json'
import vi from '../locales/vi.json'
import zhTW from '../locales/zh-TW.json'
import zh from '../locales/zh.json'

const locales = { en, fr, ja, ru, vi, zh, 'zh-TW': zhTW }
const requiredKeys = [
  'Expand all',
  'Select preset',
  'Delete model "{{name}}"? This cannot be undone.',
  'Are you sure you want to delete "{{name}}"? Users who authenticated with this provider will no longer be able to log in.',
  '{{count}} announcements deleted. Click "Save Settings" to apply.',
  '{{count}} API entries deleted. Click "Save Settings" to apply.',
  '{{count}} FAQs deleted. Click "Save Settings" to apply.',
  '{{count}} groups deleted. Click "Save Settings" to apply.',
]

describe('locale resources', () => {
  test.each(Object.entries(locales))(
    '%s translates channel and settings actions',
    (language, resource) => {
      const translations: Record<string, string> = resource.translation
      for (const key of requiredKeys) {
        expect(translations[key], key).toBeTruthy()
        if (language !== 'en') expect(translations[key], key).not.toBe(key)
      }
    }
  )

  test.each(Object.entries(locales))(
    '%s preserves interpolation parameters without translation artifacts',
    (_language, resource) => {
      for (const [key, value] of Object.entries(resource.translation)) {
        const english = (en.translation as Record<string, string>)[key]
        const expected = [
          ...new Set(english?.match(/\{\{.*?\}\}/g) ?? []),
        ].sort()
        const actual = [...new Set(value.match(/\{\{.*?\}\}/g) ?? [])].sort()
        expect(actual, key).toEqual(expected)
        expect(value, key).not.toMatch(/__\s*PH_\d+\s*__/)
      }
    }
  )

  test('Japanese import and model errors render their supplied details', async () => {
    const instance = createInstance()
    await instance.init({ lng: 'ja', resources: { ja }, nsSeparator: false })
    expect(
      instance.t('Failed to parse JSON file: {{name}}', {
        name: 'account.json',
      })
    ).toContain('account.json')
    expect(
      instance.t('Model pull failed: {{msg}}', { msg: 'connection refused' })
    ).toContain('connection refused')
    expect(
      instance.t('Parsed {{count}} service account file(s)', { count: 3 })
    ).toContain('3')
  })

  test.each(['fr', 'ja', 'ru', 'vi'] as const)(
    '%s localizes recovery and reusable model group descriptions',
    (language) => {
      for (const key of [
        'Please retry or refresh the page.',
        'Reusable sets of models you can attach to channels.',
      ] as const) {
        expect(locales[language].translation[key]).not.toBe(en.translation[key])
      }
    }
  )

  test('Traditional Chinese localizes promotion and creation workflows', () => {
    for (const key of [
      'Promotion Center',
      'Withdraw cash commission',
      'Generate credential',
      'Select an API key',
    ] as const) {
      expect(zhTW.translation[key]).not.toBe(en.translation[key])
    }
  })
})
