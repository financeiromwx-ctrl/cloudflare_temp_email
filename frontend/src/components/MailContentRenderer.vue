<script setup>
import { ref } from "vue";
import { useScopedI18n } from '@/i18n/app'
import { CloudDownloadRound, ReplyFilled, ForwardFilled, FullscreenRound } from '@vicons/material'
import ShadowHtmlComponent from "./ShadowHtmlComponent.vue";
import AiExtractInfo from "./AiExtractInfo.vue";
import { getDownloadEmlUrl } from '../utils/email-parser';
import { utcToLocalDate } from '../utils';
import { useGlobalState } from '../store';

const { preferShowTextMail, useIframeShowMail, useUTCDate, isDark } = useGlobalState();

const { t } = useScopedI18n('components.MailContentRenderer')

const props = defineProps({
  mail: {
    type: Object,
    required: true
  },
  showEMailTo: {
    type: Boolean,
    default: true
  },
  enableUserDeleteEmail: {
    type: Boolean,
    default: false
  },
  showReply: {
    type: Boolean,
    default: false
  },
  showSaveS3: {
    type: Boolean,
    default: false
  },
  onDelete: {
    type: Function,
    default: () => { }
  },
  onReply: {
    type: Function,
    default: () => { }
  },
  onForward: {
    type: Function,
    default: () => { }
  },
  onSaveToS3: {
    type: Function,
    default: () => { }
  }
});

const showTextMail = ref(preferShowTextMail.value);
const showAttachments = ref(false);
const curAttachments = ref([]);
const attachmentLoding = ref(false);
const showFullscreen = ref(false);

const handleDelete = () => {
  props.onDelete();
};

const handleViewAttachments = () => {
  curAttachments.value = props.mail.attachments;
  showAttachments.value = true;
};

const handleReply = () => {
  props.onReply();
};

const handleForward = () => {
  props.onForward();
};

const handleSaveToS3 = async (filename, blob) => {
  attachmentLoding.value = true;
  try {
    await props.onSaveToS3(filename, blob);
  } finally {
    attachmentLoding.value = false;
  }
};

const getSecurityColor = (status) => {
  if (!status) return 'default';
  const s = status.toLowerCase();
  if (s === 'pass') return 'success';
  if (s === 'fail' || s === 'softfail') return 'error';
  if (s === 'neutral' || s === 'none') return 'warning';
  return 'default';
};

const copyRawHeaders = async () => {
  try {
    await navigator.clipboard.writeText(props.mail.raw_headers || '');
  } catch (error) {
    console.error('Copy failed', error);
  }
};
</script>

<template>
  <div class="mail-content-renderer">
    <!-- 邮件信息标签 -->
    <n-space style="margin-bottom: 10px;">
      <n-tag type="info">
        ID: {{ mail.id }}
      </n-tag>
      <n-tag type="info">
        {{ utcToLocalDate(mail.created_at, useUTCDate.value) }}
      </n-tag>
      <n-tag type="info">
        FROM: {{ mail.source }}
      </n-tag>
      <n-tag v-if="showEMailTo" type="info">
        TO: {{ mail.address }}
      </n-tag>

      <!-- 操作按钮 -->
      <n-popconfirm v-if="enableUserDeleteEmail" @positive-click="handleDelete">
        <template #trigger>
          <n-button tertiary type="error" size="small">{{ t('delete', 'Delete') }}</n-button>
        </template>
        {{ t('deleteMailTip', 'Confirm deletion?') }}
      </n-popconfirm>

      <n-button v-if="mail.attachments && mail.attachments.length > 0" size="small" tertiary type="info"
        @click="handleViewAttachments">
        {{ t('attachments', 'Attachments') }}
      </n-button>

      <n-button tag="a" target="_blank" tertiary type="info" size="small" :download="mail.id + '.eml'"
        :href="getDownloadEmlUrl(mail.raw)">
        <template #icon>
          <n-icon :component="CloudDownloadRound" />
        </template>
        {{ t('downloadMail', 'Download') }}
      </n-button>

      <n-button v-if="showReply" size="small" tertiary type="info" @click="handleReply">
        <template #icon>
          <n-icon :component="ReplyFilled" />
        </template>
        {{ t('reply', 'Reply') }}
      </n-button>

      <n-button v-if="showReply" size="small" tertiary type="info" @click="handleForward">
        <template #icon>
          <n-icon :component="ForwardFilled" />
        </template>
        {{ t('forward', 'Forward') }}
      </n-button>

      <n-button size="small" tertiary type="info" @click="showFullscreen = true">
        <template #icon>
          <n-icon :component="FullscreenRound" />
        </template>
        {{ t('fullscreen', 'Fullscreen') }}
      </n-button>
    </n-space>

    <!-- AI 提取信息 -->
    <AiExtractInfo :metadata="mail.metadata" />

    <n-tabs type="line" animated>
      <n-tab-pane name="body" :tab="t('bodyTab', 'Body')">
        <div style="margin-bottom: 10px;">
          <n-button size="small" tertiary type="info" @click="showTextMail = !showTextMail">
            {{ showTextMail ? t('showHtmlMail', 'Show HTML') : t('showTextMail', 'Show Text') }}
          </n-button>
        </div>
        <!-- 邮件内容 -->
        <div class="mail-content" :class="{ 'dark-mode': isDark }">
          <pre v-if="showTextMail" class="mail-text">{{ mail.text }}</pre>
          <iframe v-else-if="useIframeShowMail" :srcdoc="mail.message" class="mail-iframe">
          </iframe>
          <ShadowHtmlComponent v-else :key="mail.id" :htmlContent="mail.message" :isDark="isDark" class="mail-html" />
        </div>
      </n-tab-pane>

      <n-tab-pane name="headers" :tab="t('headersTab', 'Headers')">
        <div class="mail-content" :class="{ 'dark-mode': isDark }">
          <pre v-if="mail.parsed_headers" class="mail-text monospace">{{ JSON.stringify(mail.parsed_headers, null, 2) }}</pre>
          <n-empty v-else :description="t('headersNotAvailable', 'Headers não disponíveis para este email.')" />
        </div>
      </n-tab-pane>

      <n-tab-pane name="security" :tab="t('securityTab', 'Security')">
        <div class="mail-content" :class="{ 'dark-mode': isDark }">
          <n-space vertical v-if="mail.security">
            <n-space>
              <n-tag :type="getSecurityColor(mail.security.spf)">SPF: {{ mail.security.spf || 'unknown' }}</n-tag>
              <n-tag :type="getSecurityColor(mail.security.dkim)">DKIM: {{ mail.security.dkim || 'unknown' }}</n-tag>
              <n-tag :type="getSecurityColor(mail.security.dmarc)">DMARC: {{ mail.security.dmarc || 'unknown' }}</n-tag>
            </n-space>
            <div style="margin-top: 16px;">
              <h4>Authentication-Results:</h4>
              <pre class="mail-text monospace">{{ mail.security.raw_authentication_results || 'N/A' }}</pre>
            </div>
          </n-space>
          <n-empty v-else :description="t('securityNotAvailable', 'Informações de segurança não disponíveis.')" />
        </div>
      </n-tab-pane>

      <n-tab-pane name="raw" :tab="t('rawTab', 'Raw')">
        <div style="margin-bottom: 10px;">
          <n-button size="small" tertiary type="info" @click="copyRawHeaders" v-if="mail.raw_headers">
            {{ t('copy', 'Copy') }}
          </n-button>
        </div>
        <div class="mail-content" :class="{ 'dark-mode': isDark }">
          <pre v-if="mail.raw_headers" class="mail-text monospace">{{ mail.raw_headers }}</pre>
          <n-empty v-else :description="t('headersNotAvailable', 'Headers não disponíveis para este email.')" />
        </div>
      </n-tab-pane>
    </n-tabs>
  </div>

  <n-drawer v-model:show="showFullscreen" width="100%" placement="bottom" :trap-focus="false" :block-scroll="false"
    style="height: 100vh;">
    <n-drawer-content :title="mail.subject" closable>
      <div class="fullscreen-mail-content" :class="{ 'dark-mode': isDark }">
        <pre v-if="showTextMail" class="mail-text">{{ mail.text }}</pre>
        <iframe v-else-if="useIframeShowMail" :srcdoc="mail.message" class="mail-iframe">
        </iframe>
        <ShadowHtmlComponent v-else :key="mail.id" :htmlContent="mail.message" :isDark="isDark" class="mail-html" />
      </div>
    </n-drawer-content>
  </n-drawer>

  <!-- 附件模态框 -->
  <n-modal v-model:show="showAttachments" preset="dialog" title="Dialog">
    <template #header>
      <div>{{ t('attachments', 'Attachments') }}</div>
    </template>
    <n-spin v-model:show="attachmentLoding">
      <n-list hoverable clickable>
        <n-list-item v-for="row in curAttachments" v-bind:key="row.id">
          <n-thing class="center" :title="row.filename">
            <template #description>
              <n-space>
                <n-tag type="info">
                  Size: {{ row.size }}
                </n-tag>
                <n-button v-if="showSaveS3" @click="handleSaveToS3(row.filename, row.blob)" ghost type="info"
                  size="small">
                  {{ t('saveToS3', 'Save to S3') }}
                </n-button>
              </n-space>
            </template>
          </n-thing>
          <template #suffix>
            <n-button tag="a" target="_blank" tertiary type="info" size="small" :download="row.filename"
              :href="row.url">
              <n-icon :component="CloudDownloadRound" />
            </n-button>
          </template>
        </n-list-item>
      </n-list>
    </n-spin>
  </n-modal>
</template>

<style scoped>
.mail-content-renderer {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.mail-content {
  margin-top: 10px;
  flex: 1;
}

.mail-text {
  white-space: pre-wrap;
  word-wrap: break-word;
  margin: 0;
  padding: 0;
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
}

.monospace {
  font-family: 'Consolas', 'Courier New', Courier, monospace;
}

.dark-mode .mail-text {
  color: #e0e0e0;
}

.mail-iframe {
  width: 100%;
  height: 100%;
  border: none;
  min-height: 400px;
}

.dark-mode .mail-iframe {
  background-color: #fff;
}

.mail-html {
  width: 100%;
  height: 100%;
}

.center {
  text-align: center;
}

.fullscreen-mail-content {
  height: calc(100vh - 120px);
  overflow: auto;
}

.fullscreen-mail-content .mail-iframe {
  min-height: calc(100vh - 120px);
}
</style>
