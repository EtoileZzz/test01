import { ModalManager } from './modals';
import { NativeBridgeService } from '../services/nativeBridge';
import { DutyStorage } from '../storage/db';
import type { DutyItem, DutySubItem, ItemType } from '../models/types';

export interface ItemModalResult {
  title: string;
  itemType: ItemType;
  startTime?: string;
  endTime?: string;
  requirePhoto: boolean;
  autoFold: boolean;
  subItems: Array<{ id: string; title: string }>;
}

export class ItemModal {
  /**
   * 打开添加或编辑条目的专业弹窗（滑块切换属性 + 细分子项配置 + 自动折叠设置）
   */
  static open(options: {
    item?: DutyItem;
    postName?: string;
    onSave: (result: ItemModalResult) => void;
    onDelete?: () => void;
  }): void {
    const isEdit = !!options.item;
    const initialItem = options.item;

    const userSettings = DutyStorage.getSettings();
    let spaceAutoSwitch = userSettings.subItemSpaceAutoSwitch !== false; // 细项根据空格自动切换

    let currentType: ItemType = initialItem?.itemType || 'STANDARD';
    let requirePhoto = initialItem?.requirePhoto || false;
    let autoFold = initialItem?.autoFold !== undefined ? initialItem.autoFold : true; // 默认开启自动折叠
    let tempSubItems: Array<{ id: string; title: string }> = (initialItem?.subItems || []).map(s => ({
      id: s.id,
      title: s.title
    }));

    const renderSubItemsHtml = () => {
      if (tempSubItems.length === 0) {
        return `<div style="font-size:0.75rem; color:var(--text-muted); padding:6px 0;">暂未添加细项，可在下方快速录入（划除所有细项后主条目自动完成）</div>`;
      }
      return tempSubItems
        .map(
          (sub, idx) => `
          <div style="display:flex; align-items:center; justify-content:space-between; padding:8px 10px; background:var(--bg-card); border:1px solid var(--border-color); border-radius:var(--radius-sm); margin-bottom:6px;">
            <div style="font-size:0.8125rem; color:var(--text-main); display:flex; align-items:center; gap:8px;">
              <span style="color:var(--text-muted); font-size:0.75rem; font-weight:600;">${idx + 1}.</span>
              <span>${sub.title}</span>
            </div>
            <button type="button" class="icon-btn del-sub-btn" data-sub-idx="${idx}" style="width:26px; height:26px; border:none; color:var(--danger);" title="删除细项">
              ✕
            </button>
          </div>
        `
        )
        .join('');
    };

    const contentHtml = `
      <form id="item-editor-form" style="display:flex; flex-direction:column; gap:14px;">
        <!-- 岗位归属提示 -->
        <div style="font-size:0.75rem; color:var(--accent); font-weight:600; display:flex; align-items:center; gap:4px;">
          <span>📍 归属岗位：${options.postName || '当前岗位'}</span>
        </div>

        <!-- 条目标题 -->
        <div>
          <label style="display:block; font-size:0.8125rem; font-weight:600; color:var(--text-main); margin-bottom:6px;">
            巡查条目名称 <span style="color:var(--danger);">*</span>
          </label>
          <input type="text" id="item-title-input" value="${initialItem?.title || ''}" placeholder="例如: 消防设施与应急通道巡视" 
            required autofocus
            style="width:100%; padding:10px 14px; border-radius:var(--radius-md); border:1px solid var(--border-color); background:var(--bg-card); color:var(--text-main); font-size:0.9375rem; outline:none;" />
        </div>

        <!-- 重点要求：条目属性选择使用滑块切换 (Segmented Slider Switch) -->
        <div>
          <label style="display:block; font-size:0.8125rem; font-weight:600; color:var(--text-main); margin-bottom:6px;">
            条目属性（滑块切换）
          </label>
          <div class="slider-switch-container" id="type-slider-switch" data-value="${currentType}">
            <div class="slider-switch-thumb"></div>
            <div class="slider-switch-option" data-type="STANDARD">
              <span>📝 常规待办</span>
            </div>
            <div class="slider-switch-option" data-type="SCHEDULED">
              <span>⏰ 时段巡查</span>
            </div>
          </div>
        </div>

        <!-- 时段巡查时间选择 (滑块切到时段巡查时展开) -->
        <div id="scheduled-time-section" style="display:${currentType === 'SCHEDULED' ? 'block' : 'none'}; padding:12px; background:var(--bg-card-subtle); border-radius:var(--radius-md); border:1px solid var(--border-color);">
          <div style="font-size:0.75rem; font-weight:600; color:var(--text-muted); margin-bottom:8px;">
            ⏰ 巡检时间区间设定
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <input type="time" id="start-time-val" value="${initialItem?.startTime || '09:00'}" 
              style="flex:1; padding:8px 10px; border-radius:var(--radius-sm); border:1px solid var(--border-color); background:var(--bg-card); color:var(--text-main); font-size:0.875rem; font-family:var(--font-mono);" />
            <span style="color:var(--text-muted); font-size:0.8125rem; font-weight:600;">至</span>
            <input type="time" id="end-time-val" value="${initialItem?.endTime || '11:30'}" 
              style="flex:1; padding:8px 10px; border-radius:var(--radius-sm); border:1px solid var(--border-color); background:var(--bg-card); color:var(--text-main); font-size:0.875rem; font-family:var(--font-mono);" />
          </div>
          <div style="display:flex; gap:6px; margin-top:8px;">
            <button type="button" class="icon-btn quick-time-btn" data-start="08:00" data-end="10:00" style="width:auto; height:28px; padding:0 10px; font-size:0.6875rem;">早巡 08:00-10:00</button>
            <button type="button" class="icon-btn quick-time-btn" data-start="14:00" data-end="16:00" style="width:auto; height:28px; padding:0 10px; font-size:0.6875rem;">午巡 14:00-16:00</button>
            <button type="button" class="icon-btn quick-time-btn" data-start="19:00" data-end="21:30" style="width:auto; height:28px; padding:0 10px; font-size:0.6875rem;">夜巡 19:00-21:30</button>
          </div>
        </div>

        <!-- 必须拍照凭证开关 -->
        <div style="display:flex; align-items:center; justify-content:space-between; padding:12px; background:var(--bg-card-subtle); border-radius:var(--radius-md); border:1px solid var(--border-color); cursor:pointer;" id="toggle-photo-card">
          <div>
            <div style="font-size:0.875rem; font-weight:600; color:var(--text-main); display:flex; align-items:center; gap:6px;">
              <span>📷 巡查现场拍照留痕</span>
              <span class="photo-req-tag ${requirePhoto ? 'ready' : ''}" id="photo-tag-preview" style="display:${requirePhoto ? 'flex' : 'none'};">必拍</span>
            </div>
            <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">
              开启后，现场核验必须拍照，归档时自动按岗位建夹打包
            </div>
          </div>
          <div class="toggle-switch ${requirePhoto ? 'on' : ''}" id="require-photo-toggle">
            <div class="toggle-knob"></div>
          </div>
        </div>

        <!-- 完成后自动折叠（默认开启） -->
        <div style="display:flex; align-items:center; justify-content:space-between; padding:12px; background:var(--bg-card-subtle); border-radius:var(--radius-md); border:1px solid var(--border-color); cursor:pointer;" id="toggle-autofold-card">
          <div>
            <div style="font-size:0.875rem; font-weight:600; color:var(--text-main); display:flex; align-items:center; gap:6px;">
              <span>📦 完成后自动折叠</span>
              <span class="badge-pill" id="autofold-tag" style="display:${autoFold ? 'inline-block' : 'none'}; font-size:0.6875rem; background:var(--accent-light); color:var(--accent);">已开启</span>
            </div>
            <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">
              核验完成后自动收起拍照留痕区域与细分子项，保持值班列表紧凑清爽
            </div>
          </div>
          <div class="toggle-switch ${autoFold ? 'on' : ''}" id="autofold-toggle">
            <div class="toggle-knob"></div>
          </div>
        </div>

        <!-- 细分子条目管理（划除所有细项后主条目自动完成，支持空格自动切换与多行批量识别） -->
        <div>
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px; flex-wrap:wrap; gap:6px;">
            <label style="font-size:0.8125rem; font-weight:600; color:var(--text-main);">
              细分子条目（可选）
            </label>
            <div style="display:flex; align-items:center; gap:6px;">
              <button type="button" class="icon-btn" id="toggle-space-switch-btn" style="width:auto; height:24px; padding:0 8px; font-size:0.6875rem; border-color:${spaceAutoSwitch ? 'var(--accent)' : 'var(--border-color)'}; background:${spaceAutoSwitch ? 'var(--accent-light)' : 'var(--bg-card)'}; color:${spaceAutoSwitch ? 'var(--accent)' : 'var(--text-muted)'}; font-weight:600;" title="输入空格或按空格键时自动生成细项并切换至下一项">
                ⌨️ 空格自动切项: ${spaceAutoSwitch ? '开' : '关'}
              </button>
              <button type="button" class="icon-btn" id="toggle-batch-sub-btn" style="width:auto; height:24px; padding:0 8px; font-size:0.6875rem; color:var(--accent); border-color:var(--accent-light); background:var(--accent-light);">
                📋 批量多行
              </button>
            </div>
          </div>
          <div id="subitems-container">
            ${renderSubItemsHtml()}
          </div>
          <div style="display:flex; gap:6px; margin-top:8px;">
            <input type="text" id="new-sub-input" placeholder="${spaceAutoSwitch ? '输入细项（输入空格自动生成并切下一项）' : '输入细项名称（支持直接粘贴多行）'}" 
              style="flex:1; padding:8px 10px; border-radius:var(--radius-sm); border:1px solid var(--border-color); background:var(--bg-card); color:var(--text-main); font-size:0.8125rem;" />
            <button type="button" class="icon-btn" id="add-sub-btn" style="width:auto; padding:0 12px; font-size:0.75rem; font-weight:600; background:var(--bg-card); border:1px solid var(--border-color); color:var(--text-main);">
              + 添加
            </button>
          </div>

          <!-- 批量多行识别输入面板 -->
          <div id="batch-sub-panel" style="display:none; margin-top:8px; padding:10px; background:var(--bg-card-subtle); border-radius:var(--radius-md); border:1px solid var(--border-color);">
            <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom:6px; font-weight:600;">
              ⚡ 批量识别多行/空格文字（自动按换行或空格解析，每行/词一个子任务）：
            </div>
            <textarea id="batch-sub-textarea" rows="4" placeholder="粘贴多行或空格分隔文本，例如：&#10;消火栓铅封完好 消防通道无堆物&#10;应急照明灯工作正常 安全出口标志清晰" 
              style="width:100%; padding:8px 10px; border-radius:var(--radius-sm); border:1px solid var(--border-color); background:var(--bg-card); color:var(--text-main); font-size:0.8125rem; font-family:var(--font-sans); resize:vertical; outline:none;"></textarea>
            <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:8px;">
              <button type="button" class="icon-btn" id="cancel-batch-sub-btn" style="width:auto; height:28px; padding:0 10px; font-size:0.75rem;">取消</button>
              <button type="button" class="icon-btn" id="apply-batch-sub-btn" style="width:auto; height:28px; padding:0 14px; font-size:0.75rem; font-weight:600; background:var(--accent); color:white; border:none;">
                ⚡ 识别并添加
              </button>
            </div>
          </div>
        </div>

        <!-- 底部提交操作栏 -->
        <div style="display:flex; gap:10px; margin-top:12px; padding-top:12px; border-top:1px solid var(--border-color);">
          ${
            isEdit && options.onDelete
              ? `
            <button type="button" class="icon-btn" id="delete-item-action-btn" style="height:44px; padding:0 16px; border-color:var(--danger); color:var(--danger); font-weight:600; font-size:0.875rem;">
              🗑️ 删除
            </button>
          `
              : ''
          }
          <button type="submit" class="icon-btn" id="save-item-action-btn" style="flex:1; height:44px; background:var(--text-main); color:var(--bg-main); font-weight:700; font-size:0.9375rem; border:none;">
            💾 保存条目
          </button>
        </div>
      </form>
    `;

    const close = ModalManager.openSheet(isEdit ? '编辑巡查条目' : '添加巡查条目', contentHtml, (card) => {
      const form = card.querySelector('#item-editor-form') as HTMLFormElement;
      const titleInput = card.querySelector('#item-title-input') as HTMLInputElement;
      const sliderSwitch = card.querySelector('#type-slider-switch') as HTMLElement;
      const scheduledSec = card.querySelector('#scheduled-time-section') as HTMLElement;
      const startTimeInput = card.querySelector('#start-time-val') as HTMLInputElement;
      const endTimeInput = card.querySelector('#end-time-val') as HTMLInputElement;
      const photoToggle = card.querySelector('#require-photo-toggle') as HTMLElement;
      const photoCard = card.querySelector('#toggle-photo-card') as HTMLElement;
      const photoTag = card.querySelector('#photo-tag-preview') as HTMLElement;
      const subContainer = card.querySelector('#subitems-container') as HTMLElement;
      const newSubInput = card.querySelector('#new-sub-input') as HTMLInputElement;
      const addSubBtn = card.querySelector('#add-sub-btn') as HTMLElement;
      const deleteBtn = card.querySelector('#delete-item-action-btn') as HTMLElement;

      // 滑块切换 (Segmented Slider Switch)
      const setItemType = (newType: ItemType) => {
        currentType = newType;
        sliderSwitch.setAttribute('data-value', newType);
        scheduledSec.style.display = newType === 'SCHEDULED' ? 'block' : 'none';
        NativeBridgeService.triggerLightHaptic();
      };

      sliderSwitch?.querySelectorAll('.slider-switch-option').forEach(opt => {
        opt.addEventListener('click', () => {
          const t = opt.getAttribute('data-type') as ItemType;
          setItemType(t);
        });
      });

      // 快速时间段选择
      card.querySelectorAll('.quick-time-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const s = btn.getAttribute('data-start') || '09:00';
          const e = btn.getAttribute('data-end') || '11:30';
          startTimeInput.value = s;
          endTimeInput.value = e;
          NativeBridgeService.triggerLightHaptic();
        });
      });

      // 拍照开关与自动折叠联动
      const autofoldCard = card.querySelector('#toggle-autofold-card') as HTMLElement;
      const autofoldToggle = card.querySelector('#autofold-toggle') as HTMLElement;
      const autofoldTag = card.querySelector('#autofold-tag') as HTMLElement;

      photoCard?.addEventListener('click', () => {
        requirePhoto = !requirePhoto;
        photoToggle.classList.toggle('on', requirePhoto);
        photoTag.style.display = requirePhoto ? 'flex' : 'none';
        photoTag.classList.toggle('ready', requirePhoto);
        NativeBridgeService.triggerLightHaptic();
      });

      autofoldCard?.addEventListener('click', () => {
        autoFold = !autoFold;
        autofoldToggle.classList.toggle('on', autoFold);
        if (autofoldTag) autofoldTag.style.display = autoFold ? 'inline-block' : 'none';
        NativeBridgeService.triggerLightHaptic();
      });

      // 绑定细项删除
      const bindSubDeleteEvents = () => {
        card.querySelectorAll('.del-sub-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const idx = parseInt(btn.getAttribute('data-sub-idx') || '-1', 10);
            if (idx >= 0 && idx < tempSubItems.length) {
              tempSubItems.splice(idx, 1);
              subContainer.innerHTML = renderSubItemsHtml();
              bindSubDeleteEvents();
              NativeBridgeService.triggerLightHaptic();
            }
          });
        });
      };
      bindSubDeleteEvents();

      // 空格自动切换交互控制
      const spaceSwitchBtn = card.querySelector('#toggle-space-switch-btn') as HTMLElement;
      const updateSpaceSwitchUi = () => {
        if (!spaceSwitchBtn) return;
        spaceSwitchBtn.innerHTML = `⌨️ 空格自动切项: ${spaceAutoSwitch ? '开' : '关'}`;
        spaceSwitchBtn.style.borderColor = spaceAutoSwitch ? 'var(--accent)' : 'var(--border-color)';
        spaceSwitchBtn.style.background = spaceAutoSwitch ? 'var(--accent-light)' : 'var(--bg-card)';
        spaceSwitchBtn.style.color = spaceAutoSwitch ? 'var(--accent)' : 'var(--text-muted)';
        if (newSubInput) {
          newSubInput.placeholder = spaceAutoSwitch
            ? '输入细项（输入空格自动生成并切下一项）'
            : '输入细项名称（支持直接粘贴多行）';
        }
      };

      spaceSwitchBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        spaceAutoSwitch = !spaceAutoSwitch;
        DutyStorage.saveSettings({ subItemSpaceAutoSwitch: spaceAutoSwitch });
        NativeBridgeService.triggerLightHaptic();
        updateSpaceSwitchUi();
      });

      // 批量多行识别控制
      const batchPanel = card.querySelector('#batch-sub-panel') as HTMLElement;
      const toggleBatchBtn = card.querySelector('#toggle-batch-sub-btn') as HTMLElement;
      const batchTextarea = card.querySelector('#batch-sub-textarea') as HTMLTextAreaElement;
      const applyBatchBtn = card.querySelector('#apply-batch-sub-btn') as HTMLElement;
      const cancelBatchBtn = card.querySelector('#cancel-batch-sub-btn') as HTMLElement;

      const addSubItemsFromText = (text: string) => {
        const delimiter = spaceAutoSwitch ? /[\r\n\s]+/ : /\r?\n/;
        const lines = text
          .split(delimiter)
          .map(l => l.trim().replace(/^[-*•\d+.\s、]+/, '').trim())
          .filter(Boolean);
        if (lines.length === 0) return;

        lines.forEach((lineText, i) => {
          tempSubItems.push({
            id: `sub_${Date.now()}_${tempSubItems.length}_${i}`,
            title: lineText
          });
        });

        subContainer.innerHTML = renderSubItemsHtml();
        bindSubDeleteEvents();
        NativeBridgeService.triggerLightHaptic();
      };

      toggleBatchBtn?.addEventListener('click', () => {
        const isShown = batchPanel.style.display === 'block';
        batchPanel.style.display = isShown ? 'none' : 'block';
        if (!isShown) batchTextarea.focus();
      });

      cancelBatchBtn?.addEventListener('click', () => {
        batchPanel.style.display = 'none';
        batchTextarea.value = '';
      });

      applyBatchBtn?.addEventListener('click', () => {
        const val = batchTextarea.value;
        if (val.trim()) {
          addSubItemsFromText(val);
          batchTextarea.value = '';
          batchPanel.style.display = 'none';
        }
      });

      // 添加新细项（支持单行、空格快速分段及粘贴多行）
      const handleAddSub = () => {
        const text = newSubInput.value.trim();
        if (!text) return;
        if (text.includes('\n') || (spaceAutoSwitch && /\s/.test(text))) {
          addSubItemsFromText(text);
        } else {
          tempSubItems.push({
            id: `sub_${Date.now()}_${tempSubItems.length}`,
            title: text
          });
          subContainer.innerHTML = renderSubItemsHtml();
          bindSubDeleteEvents();
          NativeBridgeService.triggerLightHaptic();
        }
        newSubInput.value = '';
      };

      // 实时监听输入：当开启空格自动切换时，输入空格自动生成细项并切换至下一项
      newSubInput?.addEventListener('input', () => {
        if (!spaceAutoSwitch) return;
        const rawVal = newSubInput.value;
        if (/\s/.test(rawVal)) {
          // 以空格结尾：用户刚敲击空格完成一个细项的输入
          if (/\s$/.test(rawVal)) {
            const tokens = rawVal
              .split(/\s+/)
              .map(t => t.trim().replace(/^[-*•\d+.\s、]+/, '').trim())
              .filter(Boolean);
            if (tokens.length > 0) {
              tokens.forEach((t, i) => {
                tempSubItems.push({
                  id: `sub_${Date.now()}_${tempSubItems.length}_${i}`,
                  title: t
                });
              });
              subContainer.innerHTML = renderSubItemsHtml();
              bindSubDeleteEvents();
              NativeBridgeService.triggerLightHaptic();
            }
            newSubInput.value = '';
          } else {
            // 包含多个空格，把前面完整的词提取为细项
            const tokens = rawVal
              .split(/\s+/)
              .map(t => t.trim().replace(/^[-*•\d+.\s、]+/, '').trim())
              .filter(Boolean);
            if (tokens.length > 1) {
              const finished = tokens.slice(0, -1);
              const ongoing = tokens[tokens.length - 1];
              finished.forEach((t, i) => {
                tempSubItems.push({
                  id: `sub_${Date.now()}_${tempSubItems.length}_${i}`,
                  title: t
                });
              });
              subContainer.innerHTML = renderSubItemsHtml();
              bindSubDeleteEvents();
              NativeBridgeService.triggerLightHaptic();
              newSubInput.value = ongoing;
            }
          }
        }
      });

      newSubInput?.addEventListener('paste', (e) => {
        const pasted = e.clipboardData?.getData('text');
        if (pasted && (pasted.includes('\n') || (spaceAutoSwitch && /\s/.test(pasted)))) {
          e.preventDefault();
          addSubItemsFromText(pasted);
          newSubInput.value = '';
        }
      });

      addSubBtn?.addEventListener('click', handleAddSub);
      newSubInput?.addEventListener('keydown', (e) => {
        if (spaceAutoSwitch && (e.key === ' ' || e.code === 'Space')) {
          const text = newSubInput.value.trim().replace(/^[-*•\d+.\s、]+/, '').trim();
          if (text) {
            e.preventDefault();
            tempSubItems.push({
              id: `sub_${Date.now()}_${tempSubItems.length}`,
              title: text
            });
            subContainer.innerHTML = renderSubItemsHtml();
            bindSubDeleteEvents();
            NativeBridgeService.triggerLightHaptic();
            newSubInput.value = '';
          }
        } else if (e.key === 'Enter') {
          e.preventDefault();
          handleAddSub();
        }
      });

      // 删除条目
      deleteBtn?.addEventListener('click', () => {
        if (confirm(`确定要彻底删除条目「${initialItem?.title}」吗？`)) {
          close();
          if (options.onDelete) options.onDelete();
        }
      });

      // 表单提交
      form?.addEventListener('submit', (e) => {
        e.preventDefault();
        const title = titleInput.value.trim();
        if (!title) {
          titleInput.focus();
          return;
        }

        NativeBridgeService.triggerLightHaptic();
        close();

        options.onSave({
          title,
          itemType: currentType,
          startTime: currentType === 'SCHEDULED' ? startTimeInput.value : undefined,
          endTime: currentType === 'SCHEDULED' ? endTimeInput.value : undefined,
          requirePhoto,
          autoFold,
          subItems: tempSubItems
        });
      });
    });
  }
}
