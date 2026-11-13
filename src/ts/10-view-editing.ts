import { EDGE_TARGETS, EVENT_LABELS, MEIJIN_EVENTS, eventText, extensionEventChoices, hintCandidates, isEdgeTarget, keySurface } from './02-language-contracts.ts';
import { keyName } from './04-syntax-sentences.ts';
import { BLOCK_SCHEMAS, BLOCK_SCHEMA_BY_ID, createBlock, decimalSource } from './05-command-presentation.ts';
import { ADVANCED_ONLY_SCHEMA_IDS, BASIC_BLOCK_SCHEMA_IDS, ENTRY_BLOCK_SCHEMA_IDS, ENTRY_PALETTE_ORDER, applyCreationDefaults, blockCreationDefaults, blockPaletteGroup, blockZoomCore, blockZoomScroll, editorInsertionHints, normalizeSearchText } from './09-editor-sessions.ts';
import { blockSearchCandidates } from './09-editor-search.ts';
import type { ActorChoice, BlockElement, BlockHandle, BodyPlace, DisabledWrites, DragState, FieldInput, HeadingChoice, InputPlace, StructuredInput, StructuredValue, OperationAnswer, ScreenPoint, ViewPlace, ViewBaseCalls, ViewEditingCalls, ViewOperation, ViewPoint, ViewRedraw, ViewVars } from '../types/block-view.d.ts';
import type { BlockSchema, BlockTree, InsertLocation, SchemaItem } from '../types/blocks.d.ts';
import type { SearchCandidate } from '../types/editor.d.ts';
import type { ActorRef, BlockHeading } from '../types/syntax-base.d.ts';

// ────────────────────────────────────────────────────────────────────────
// 10 — Block view editing: edits through the session, the fields and their inputs, the block list, choosing a place,
// moving and dropping blocks, zoom and pan, and the popovers. They ask the drawing to draw the view again.
// ────────────────────────────────────────────────────────────────────────
// The parts of the block view come in this order in src/akari.html: a part uses only the parts before it and asks
// the parts after it only to draw the view again (AUDIT.md「ソースの境界」). Called at the start of every
// createBlockEditorView: viewVars is the state of that one view, viewCalls the functions it offers the parts after it
// and those it calls from the parts before it, and viewRedraw the redraw request it calls (a later part fills it).
export function createViewEditing(viewVars: ViewVars, viewCalls: ViewBaseCalls, viewRedraw: ViewRedraw): asserts viewCalls is ViewBaseCalls & ViewEditingCalls {
  const editDisclosure = (node: BlockTree, key: string, label: string, className: string) => {
    const details = viewCalls.E('details', className), id = node.id + ':' + key;
    details.dataset.blockuiDisclosure = id; details.open = viewVars.openEditors.has(id);
    details.append(viewCalls.E('summary', '', label));
    viewCalls.listen(details, 'toggle', () => {
      if (details.isConnected) details.open ? viewVars.openEditors.add(id) : viewVars.openEditors.delete(id);
      scheduleGeometry();
    });
    return details;
  };
  function placeNodeToolsSoon() {
    if (viewVars.toolsFrame !== null) return;
    viewVars.toolsFrame = viewVars.doc.defaultView.requestAnimationFrame(() => {
      viewVars.toolsFrame = null;
      const box = viewVars.workspace.querySelector('.blockui-node.blockui-selected')?.getBoundingClientRect(), room = viewVars.workspace.getBoundingClientRect();
      if (box && box.bottom > room.top && box.top < room.bottom) viewCalls.placeNodeTools();
      placeBlockPopovers();
    });
  }
  function operate(op: ViewOperation, { fromPending = false }: { fromPending?: boolean } = {}): OperationAnswer {
    if (viewVars.isLocked()) {
      viewCalls.announce('動いている ときや じゅんびの とちゅうは、ブロックを かえられないよ。「■ 止める」を おしてから なおしてね', true);
      return { ok: false, reason: 'いまは ブロックを なおせないよ' };
    }
    if (!fromPending) {
      const ready = flush();
      if (!ready.ok) return ready;
    }
    const owner = viewCalls.session()?.ownerKey;
    let result: OperationAnswer;
    viewVars.committing = true;
    try {
      result = viewCalls.normalizedResult(viewVars.onOperation(op));
      if (result && typeof result.then === 'function')
        throw Error('ブロック編集の確定は同期処理が必要です');
    } catch (error) {
      result = { ok: false, error };
    } finally {
      viewVars.committing = false;
    }
    if (!result.ok) {
      viewCalls.announce(viewCalls.errorText(result.error || result.reason), true);
      return result;
    }
    if (viewCalls.session()?.ownerKey !== owner) {
      const transition=result.ownerTransition;
      // (a transition that names the old key is there: an operation is made with a session shown)
      if(transition?.from!==owner||transition!.to!==viewCalls.session()?.ownerKey){
        viewCalls.announce('なおして いた ところが かわったよ。もう一度 やってね', true);
        return { ok: false, reason: 'なおして いた ところが かわったよ。もう一度 やってね' };
      }
      // Persisting a new event gives the same document its permanent key.
      if(viewVars.displaySession?.ownerKey===owner)viewVars.displaySession={...viewVars.displaySession!,ownerKey:transition!.to};
    }
    viewCalls.announce(result.changed === false ? '中身は かわって いないよ'
      : ['insert', 'wrap', 'expression', 'variadic-insert'].includes(op.type) ? 'ブロックを 入れたよ'
      : ['remove', 'variadic-remove'].includes(op.type) ? 'ブロックを けしたよ'
      : ['move', 'move-run'].includes(op.type) ? 'ブロックを もって いったよ' : op.type === 'duplicate' ? 'ブロックを もう1つ 作ったよ' : 'ブロックを かえたよ');
    if (!fromPending) viewRedraw.render({ force: true });
    return result;
  }
  function flushToTarget(next: Element | null) {
    // A number that cannot be read is given up when another field is entered: its field shows the value it had, and
    // the new input starts without the old mistake (E-12).
    if (viewVars.pending && next !== viewVars.pending.input && next?.matches?.('input,textarea,select') && viewVars.root.contains(next) &&
        !next.closest('dialog') && !viewCalls.readable(viewVars.pending)) {
      dropPending();
      viewCalls.announce('');
      return { ok: true };
    }
    // Keep the incoming control alive until it receives its native click or
    // input. A blur commit must not replace that control during focus transfer.
    viewVars.deferredFocus = next && viewVars.root.contains(next) ? next : null;
    const ready = flush({ focus: false });
    if (!ready.ok) viewVars.deferredFocus = null;
    return ready;
  }
  // (a signed number's field is a number; what an input throws is an Error; the element that takes the focus is one)
  function editInput(input: FieldInput, node: BlockTree, field: { key: string; type?: string }, annotation = false) {
    const original = () => {
      const current = viewVars.index.get(node.id)?.node || node;
      return annotation ? current.annotations[field.key]
        : input.dataset.signedParentId ? -(current.fields as { [key: string]: number })[field.key] : current.fields[field.key];
    };
    const read = () => viewCalls.edgeStored(node, field, viewCalls.readInputValue(input, field));
    const refresh = () => {
      if (viewVars.rendering || viewVars.committing || !input.isConnected) return;
      if (viewVars.deferredFocus === input) viewVars.deferredFocus = null;
      if (viewVars.deferredRender) viewCalls.syncDeferredTree();
      if (!viewVars.pending || viewVars.pending.input !== input) {
        const f = flush();
        if (!f.ok && viewVars.pending?.input !== input) {
          // (a number shows again as its field drew it: a minus number with its sign, －2)
          const value = original();
          // (a qualifier left empty shows its とくに なし, as dropPending and cancel give it back)
          input.value = field.type === 'number' && typeof value === 'number' ? numberShown(input, value) : field.type === 'qualifier' && value === null ? 'none' : String(viewCalls.edgeShown(node, field, value) ?? '');
          viewVars.pending?.input?.focus();
          return;
        }
      }
      const previous = viewVars.pending?.input === input ? viewVars.pending : null;
      if (!previous) viewCalls.announce('');
      viewVars.pending = {
        input,
        id: node.id,
        key: field.key,
        field,
        annotation,
        ownerKey: previous?.ownerKey ?? viewCalls.session()?.ownerKey,
        sourceRevision: previous?.sourceRevision ?? viewCalls.session()?.sourceRevision,
        contextRevision: previous?.contextRevision ?? viewCalls.session()?.contextRevision,
        original:original(),
        composing: input.dataset.composing === 'true',
        read,
        error: '',
        invalid: false,
        // A mistake shown under the field stays while the field keeps the value it was shown for.
        shown: previous?.shown && previous.shownValue === input.value,
        shownValue: previous?.shownValue,
      };
      try {
        read();
      } catch (error) {
        viewVars.pending.error = (error as Error).message;
        viewVars.pending.invalid = true;
      }
      input.setAttribute('aria-invalid', viewVars.pending.error ? 'true' : 'false');
      viewCalls.notifyPending();
      updateControls();
    };
    viewCalls.listen(input, 'input', refresh);
    viewCalls.listen(input, 'compositionstart', () => {
      input.dataset.composing = 'true';
      refresh();
    });
    viewCalls.listen(input, 'compositionend', () => {
      input.dataset.composing = 'false';
      refresh();
    });
    viewCalls.listen(input, 'change', () => {
      refresh();
      if (input.tagName === 'SELECT') flush();
    });
    viewCalls.listen(input, 'blur', (event) => {
      if (viewVars.rendering || viewVars.committing || !input.isConnected) return;
      if (viewVars.pending?.input === input && !(event.relatedTarget as Element | null)?.closest('#uiLevel,#tutorialExit,#tutorialStart,[data-blockui-action="cancel"],[data-blockui-action="edit-text"],[data-blockui-text-action],[data-blockui-value-type]'))
        flushToTarget(event.relatedTarget as Element | null);
    });
    viewCalls.listen(input, 'keydown', (event) => {
      if (event.isComposing || input.dataset.composing === 'true') return;
      if (event.key === 'Enter' && input.tagName !== 'TEXTAREA') {
        event.preventDefault();
        event.stopPropagation();
        flush({explicit:true});
      } else if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        cancelField();
      }
    });
  }
  // (a number field reads a number, a memo's a text; what reading throws is an Error; a NEG has its value; a field
  // focused again after a number is put in is a text field)
  function flush({ focus = true, explicit = false }: { focus?: boolean; explicit?: boolean } = {}): OperationAnswer {
    if (viewVars.destroyed) return { ok: true };
    if (viewVars.drag?.started || viewVars.replacement)
      return {
        ok: false,
        pending: true,
        reason: viewVars.replacement
          ? 'もとの ばしょに 入れる ブロックを えらぶか、「' + viewCalls.cancelLabel() + '」を おしてね'
          : 'ブロックを おく ところで はなしてね。やめる ときは Esc キーを おしてね',
      };
    if (!viewVars.pending) return { ok: true };
    const p = viewVars.pending;
    if(p.field.type==='heading'&&!explicit){
      const reason='いつ動くかを えらんだら「この 本文の きっかけを かえる」を おしてね';
      viewCalls.announce(reason,true);return {ok:false,pending:true,reason};
    }
    // A mistake found when the input is to be decided is shown right under the field (E-12).
    const refused: (message: string) => OperationAnswer = (message) => {
      p.error = message;
      p.shown = true;
      p.shownValue = p.input.value;
      viewCalls.notifyPending();
      viewCalls.announce(p.error, true);
      updateControls();
      return { ok: false, pending: true, reason: p.error };
    };
    if (p.composing || p.input.dataset.composing === 'true')
      return refused('日本語の へんかんを おわらせてから、もう一度 やってね');
    if (viewCalls.session()?.ownerKey !== p.ownerKey)
      return refused('入れて いる とちゅうで、なおして いた ところが かわったよ。「決める」を おすか、「' + viewCalls.cancelLabel() + '」を おしてね');
    if (
      viewCalls.session()?.sourceRevision !== p.sourceRevision ||
      viewCalls.session()?.contextRevision !== p.contextRevision
    ) {
      return refused('入れている とちゅうで、本文や まわりが かわったよ。「' + viewCalls.cancelLabel() + '」を おして、もう一度 あいている ところを えらんでね');
    }
    let value: unknown;
    try {
      value = p.read();
    } catch (error) {
      p.invalid = true;
      p.input.setAttribute('aria-invalid', 'true');
      if (focus) p.input.focus();
      return refused((error as Error).message);
    }
    if (Object.is(value, p.original)) {
      viewVars.pending = null;
      viewCalls.notifyPending();
      updateControls();
      return { ok: true, changed: false };
    }
    let op: ViewOperation = { type: p.annotation ? 'annotation' : 'field', id: p.id, key: p.key, value };
    if(p.field.type==='heading'&&p.input.dataset.triggerMetadataOnly==='true')op.preserveBody=true;
    if (!p.annotation && p.field.type === 'number' &&
      (p.input.dataset.expressionHole || p.input.dataset.signedParentId || value as number < 0 || Object.is(value, -0))) {
      const literal = createBlock('NumberLiteral');
      literal.fields.value = Math.abs(value as number);
      let replacement = literal;
      if (value as number < 0 || Object.is(value, -0)) {
        replacement = createBlock('UnaryExpression:NEG');
        replacement.inputs.value!.fields.value = Math.abs(value as number);
      }
      op = p.input.dataset.signedParentId && (value as number < 0 || Object.is(value,-0))
        ? {type:'field',id:p.id,key:p.key,value:Math.abs(value as number)}
        : { type: 'replace', id: p.input.dataset.signedParentId || p.id, node: replacement };
    }
    if (p.field.type === 'comment' && /[\r\n]/.test(value))
      op = { type: 'comment-lines', id: p.id, lines: (value as string).replace(/\r\n?/g, '\n').split('\n') };
    const result = operate(op, { fromPending: true });
    if (!result.ok) {
      p.input.setAttribute('aria-invalid', 'true');
      if (focus) p.input.focus();
      return { ...result, ...refused(viewCalls.errorText(result.error || result.reason)) };
    }
    viewVars.pending = null;
    viewCalls.notifyPending();
    viewRedraw.render({ force: true });
    if(focus&&p.field.type==='number'&&op.type==='replace'){
      const node=viewVars.index.get(viewCalls.session()?.blockSelection)?.node,
        literal=node?.schemaId==='UnaryExpression:NEG'?node.inputs.value:node,
        control=[...viewVars.workspace.querySelectorAll<HTMLInputElement>('[data-focus-key]')].find(n=>n.dataset.focusKey===literal?.id+':field:value');
      control?.focus({preventScroll:true});
      if(control?.setSelectionRange)control.setSelectionRange((p.input as HTMLInputElement).selectionStart,(p.input as HTMLInputElement).selectionEnd,(p.input as HTMLInputElement).selectionDirection as SelectionDirection);
    }
    return { ok: true, changed: result.changed !== false };
  }
  // A number as its field shows it: the field of a minus number shows the sign as the drawing writes it (－2), not as
  // a number's text (-2), so the value it had comes back as it was drawn.
  function numberShown(input: FieldInput, value: number) {
    return input.dataset.signedParentId && (value < 0 || Object.is(value, -0)) ? '－' + decimalSource(-value) : decimalSource(value);
  }
  // Gives up the value being typed: the field shows the value it had again.
  function dropPending() {
    const field = viewVars.pending;
    viewVars.pending = null;
    if (field?.input?.isConnected) {
      // (the value a field had is of its kind: a qualifier's and a shown one are text, a number's a number; a group of
      // controls is given its value as it was, which its setter does not read: it puts its controls back)
      field.input.value = field.field.type === 'qualifier' ? field.original as string ?? 'none'
        : field.field.type === 'number' ? field.original === undefined ? '' : numberShown(field.input, field.original as number) : viewCalls.edgeShown(viewVars.index.get(field.id)?.node, field.field, field.original) as string ?? '';
      field.input.setAttribute('aria-invalid', 'false');
      // (an INPUT is a text box)
      if (field.input.tagName === 'INPUT') field.input.title = (field.input as HTMLInputElement).value;
      // A surface left open for a field that no longer has the focus closes with it.
      if (field.input !== viewVars.doc.activeElement) field.input.closest('.blockui-editing-field')?.classList.remove('blockui-editing-field');
    }
    viewCalls.notifyPending();
    updateControls();
    scheduleGeometry();
  }
  function cancelField() {
    dropPending();
    // Named as its button is (F-23: 入力を やめる); a block being put in that still has holes stays.
    viewCalls.announce('入力を やめたよ' + (viewCalls.session()?.blockDraft ? '。組み立てていた ブロックは のこって いるよ' : ''));
    return { ok: true };
  }
  function cancel() {
    const stopped = viewCalls.cancelLabel().replace(/やめる$/, 'やめたよ'), hadKeys = viewVars.root.contains(viewVars.doc.activeElement);
    const field = viewVars.pending;
    viewVars.pending = null;
    viewVars.destination = null;
    viewVars.replacement = null;
    viewVars.moving = null;
    cancelDrag();
    const draft = viewCalls.session()?.blockDraft;
    if (draft) {
      // (a draft is a session's)
      Object.assign(viewCalls.session()!, draft.baseline, { blockDraft: null, pendingEdit: null });
      viewVars.availabilityCache.clear();
    }
    viewVars.onPending(null);
    viewVars.onCancel();
    if (field?.input?.isConnected) {
      const value = field.original;
      // (the value a field had is of its kind; an expression hole's number has none, and what is written for it is
      // replaced at once by the drawing that follows; a group of controls puts its controls back)
      field.input.value =
        field.field.type === 'qualifier'
          ? value === null
            ? 'none'
            : value as string
          : field.field.type === 'number'
            ? numberShown(field.input, value as number)
            : String(value ?? '');
      field.input.setAttribute('aria-invalid', 'false');
    }
    viewCalls.announce(stopped);
    viewRedraw.render({ force: true });
    // The pressed やめる (or the field) is no longer shown: the keys stay in the block view, not on the page (E2-01).
    if (hadKeys && (!viewVars.doc.activeElement || viewVars.doc.activeElement === viewVars.doc.body)) viewCalls.keepKeys();
    return { ok: true };
  }
  function updateControls() {
    if (viewVars.deferredFocus?.isConnected && viewVars.root.contains(viewVars.deferredFocus)) return;
    viewVars.commitButton.hidden = !viewVars.pending;
    viewVars.commitButton.disabled = viewVars.isLocked() || !viewVars.pending;
    const draft = viewCalls.session()?.blockDraft;
    viewVars.cancelButton.disabled = !viewVars.pending && !viewVars.moving && !viewVars.drag && !viewVars.replacement && !viewVars.destination && !draft;
    viewVars.cancelButton.textContent = viewCalls.cancelLabel();
    // While a block is only being carried, what it does is shown by the pointer (E-04): no controls cover the blocks.
    viewVars.controls.hidden = !viewVars.pending && !viewVars.moving && !viewVars.replacement && !viewVars.destination && !draft;
    viewVars.root.classList.toggle('blockui-interacting', !viewVars.controls.hidden);
    viewVars.root.classList.toggle('blockui-moving', !!viewVars.moving || !!viewVars.drag?.started);
    // While a place for a sentence is chosen or a sentence is moved, the places between blocks open up (E-07); the
    // chosen place, or the block being moved, stays where it is on the screen.
    const choosing = !!viewVars.destination?.body, movingBlock = !!viewVars.moving && viewCalls.schemaOf(viewVars.index.get(viewVars.moving.id)?.node)?.category === 'statement',
      opens = choosing || movingBlock, changes = opens !== viewVars.root.matches('.blockui-choosing,.blockui-moving-block'),
      // (a block moved is the one moving)
      anchor = !changes ? null : !opens ? viewVars.openAnchor : movingBlock ? viewCalls.locationElement({ id: viewVars.moving!.id })
        : [...viewVars.world.querySelectorAll<HTMLElement>('[data-blockui-body]')].find(n => viewCalls.sameLocation(viewVars.destination, viewCalls.locationFromElement(n)));
    keepInView(anchor, () => {
      viewVars.root.classList.toggle('blockui-choosing', choosing);
      viewVars.root.classList.toggle('blockui-moving-block', movingBlock);
    });
    if (changes) viewVars.openAnchor = opens ? anchor : null;
    if (!opens && !viewVars.drag?.started) viewVars.planeFloor = 0;
    viewVars.fieldError.textContent = viewVars.pending?.shown && viewVars.pending.error || '';
    if (viewVars.pending?.input) {
      const described = (viewVars.pending.input.getAttribute('aria-describedby') || '').split(' ').filter(id => id && id !== viewVars.fieldError.id);
      if (viewVars.pending.shown && viewVars.pending.error) described.push(viewVars.fieldError.id);
      if (described.length) viewVars.pending.input.setAttribute('aria-describedby', described.join(' '));
      else viewVars.pending.input.removeAttribute('aria-describedby');
    }
    viewVars.destinationLabel.textContent = viewVars.replacement
      ? 'もとの ばしょに 入れる ブロックを えらんでね'
      : viewVars.moving
        ? viewVars.moving.type === 'run'
          ? 'この ブロックから 下の ' + viewCalls.runIds(viewVars.moving.id).length + 'この ブロックを もっていく ところを えらんでね'
          : 'どこへ もって いくか えらんでね'
        : viewVars.destination?.input
          ? viewCalls.destinationDescription()
          : viewVars.destination?.body
            ? viewCalls.destinationDescription()
            : draft ? 'あいている ところを えらんで、ブロックを 入れてね' : '入れたら「決める」を おしてね';
    viewCalls.placeControls();
  }
  // A place chosen with the keyboard (Enter on 「＋ ここに入れる」) opens 「ブロックを さがす」 to type in (E-16).
  function chooseDestination(location: InsertLocation, { keyboard = false }: { keyboard?: boolean } = {}) {
    if (viewVars.isLocked()) return;
    const ready = flush();
    if (!ready.ok) return;
    if (viewVars.moving) {
      completeMove(location);
      return;
    }
    viewVars.destination = { ...location };
    const modeChanged = viewVars.paletteMode !== 'all' && viewVars.paletteMode !== (location.body ? 'statement' : 'expression');
    if (modeChanged) viewVars.paletteMode = 'all';
    renderPalette();
    updateControls();
    for (const n of viewVars.workspace.querySelectorAll<HTMLElement>('[data-blockui-drop]'))
      n.classList.toggle(
        'blockui-chosen-destination',
        viewCalls.sameLocation(location, viewCalls.locationFromElement(n)),
      );
    viewCalls.announce(viewCalls.destinationDescription() + (modeChanged ? ' 「ブロックの しゅるい」を「すべてのブロック」に かえたよ。なかまと さがす ことばは そのままだよ。' : ''));
    if(viewVars.options.tutorialActive?.())viewVars.options.onDestinationSelected?.({...location});
    else {
      if (keyboard && viewVars.paletteControls.hidden) viewVars.paletteToggle.click();
      // The last word is kept, selected, so a new word typed replaces it (E-01, E-16).
      viewVars.search.focus({ preventScroll: true });
      viewVars.search.select();
    }
  }
  // (a rule is put only in a body's tree; a place is there when the block can go in it)
  function paletteAdd(schema: SearchCandidate) {
    const location = viewVars.destination || viewCalls.defaultDestination();
    if (schema.category === 'rule') {
      const a = viewCalls.ruleAvailability();
      if (!a.enabled) { viewCalls.announce(a.reason, true); return; }
      const result = operate({ type: 'variadic-insert', parentId: viewVars.tree!.id, input: 'rules', index: (viewVars.tree!.inputs.rules || []).length,
        node: viewCalls.newRule() });
      if (result.ok) viewCalls.announce('つづけて動くルールを 入れたよ。きまりと 速さを 決めてね');
      return;
    }
    if (schema.category === 'expression' && !location?.input) {
      viewCalls.announce(
        'あいている ところへ おしたまま 運んでね。あいている ところの「計算を入れる」からも 入れられるよ',
      );
      return;
    }
    const a = viewCalls.availability(schema.id, location, schema.candidateNode);
    if (!a.enabled) {
      viewCalls.announce(a.reason, true);
      return;
    }
    const node = a.node || applyCreationDefaults(createBlock(schema.id, { ...viewCalls.context(), ...blockCreationDefaults(viewCalls.project(), viewCalls.context().targetId), idPrefix: viewVars.viewId }), viewCalls.project(), viewCalls.context().targetId);
    const wraps = viewCalls.wrapCount(schema, node, location);
    const op: ViewOperation = location!.body
      ? { type: wraps ? 'wrap' : 'insert', ...location as BodyPlace, node }
      : { type: 'expression', ...location as InputPlace, node };
    const result = operate(op);
    if (result.ok) {
      const containsHole: (part: BlockTree | undefined) => boolean | undefined = (part) => part && (
        BLOCK_SCHEMA_BY_ID.get(part.schemaId)?.kind === 'Hole' ||
        [...Object.values(part.inputs || {}), ...Object.values(part.bodies || {})]
          .flat().some(containsHole)
      );
      if (viewVars.searchText && containsHole(node)) {
        viewVars.previousSearch = viewVars.searchText;
        viewVars.searchText = viewVars.search.value = '';
      }
      viewVars.destination = null;
      for (const chosen of viewVars.workspace.querySelectorAll('.blockui-chosen-destination')) chosen.classList.remove('blockui-chosen-destination');
      renderPalette();
      updateControls();
      const placedId = location!.body ? viewCalls.placedAt(location, node.schemaId, true) : viewCalls.session()?.blockSelection;
      focus({ id: placedId });
      if (schema.bodies?.length) viewCalls.attendEmptyValue(placedId);
    }
  }
  function renderPalette() {
    if (viewVars.options.readOnly) return;
    if (viewVars.destroyed) return;
    const kept = viewVars.doc.activeElement?.matches?.(viewVars.PALETTE_KEYS) && viewVars.palette.contains(viewVars.doc.activeElement) ? viewCalls.paletteKey(viewVars.doc.activeElement) : null;
    viewVars.faceSymbols = null;
    viewVars.powerHelp.hidden = document.body.dataset.uiLevel !== 'advanced';
    viewVars.modeSelect.value = viewVars.paletteMode;
    viewCalls.syncLibraryToggle();
    const entry = document.body.dataset.uiLevel === 'entry';
    const query = entry ? '' : viewVars.searchText.trim().toLocaleLowerCase();
    // A quantity whose unit is chosen (たんいを つけた 数) is a くわしく block: only there are units chosen (E-02).
    const unitChoice = document.body.dataset.uiLevel === 'advanced';
    // はじめて shows only blocks that change something in this work (F-03): 「はいけいを かえる」 when it has two
    // backdrops or more, 「〔音〕を鳴らす」 when it has a sound.
    const entryWorks: (s: BlockSchema) => boolean = (s) => s.id === 'LooksCommand:SET_BACKDROP' ? (viewCalls.project()?.stage?.backdrops?.length || 0) > 1
      : s.id === 'SoundCommand:SAMPLE_WAIT' ? (viewCalls.project()?.sounds?.length || 0) > 0 : true;
    const registry = BLOCK_SCHEMAS.filter((s) => !s.draftOnly && ['statement', 'expression'].includes(s.category)
      && (!entry || ENTRY_BLOCK_SCHEMA_IDS.has(s.id) && entryWorks(s)) && (unitChoice || s.id !== 'QuantityLiteral')
      && (unitChoice || !ADVANCED_ONLY_SCHEMA_IDS.has(s.id)));
    const all: SearchCandidate[] = registry.filter((s) => entry || viewVars.paletteMode === 'all' || s.category === viewVars.paletteMode);
    const groups = [...viewVars.PALETTE_GROUP_LABELS];
    const categoryScroll = viewVars.categorySelect.scrollTop;
    viewVars.categorySelect.replaceChildren();
    for (const [g, label] of groups) {
      if (g === 'basic' && !all.some((s) => BASIC_BLOCK_SCHEMA_IDS.has(s.id))) continue;
      if (g && g !== 'basic' && !all.some((s) => blockPaletteGroup(s) === g)) continue;
      const chip = viewCalls.button(
        label,
        'palette-category',
        () => {
          viewVars.category = g;
          viewVars.categoryExplicit = true;
          viewVars.paletteList.scrollTop = 0;
          renderPalette();
        },
        {
          'data-blockui-category': g,
          'aria-pressed': viewVars.category === g,
          'data-palette-tone': g || 'data',
        },
      );
      viewVars.categorySelect.append(chip);
    }
    viewVars.categorySelect.scrollTop = categoryScroll;
    // A search looks through every category, whichever is chosen (E-13); the results keep their category colours.
    viewVars.searchScope.textContent=query?'すべての なかまから さがして いるよ':'すべての なかまから さがせるよ';
    viewVars.restoreSearch.hidden = !viewVars.previousSearch || !!query;
    viewVars.restoreSearch.textContent = `前の「${viewVars.previousSearch}」を もう一度 さがす`;
    const location = viewVars.destination || viewCalls.defaultDestination(),
      projectState = viewCalls.project();
    // (the list is shown for a session's work)
    // The view's context gives the signal names through a call; the hints are given the names themselves.
    const hints = !query ? [] : location?.body ? editorInsertionHints(viewCalls.session()!, location, {project:projectState,context:viewCalls.context()})
      : hintCandidates(projectState!, viewCalls.context().targetId, {source:viewCalls.session()?.sourceText || '', ...viewCalls.context(), signalNames:viewCalls.context().signalNames?.()});
    const searched = (query ? blockSearchCandidates(projectState!, viewCalls.context(), query, hints) : all)
      // 自分で作ったブロック: a call names a てじゅん or 答えを もとめる of the work, never one that does not exist; 「返す」
      // is a block of 答えを もとめる only (F2-06).
      .filter(s => !(['UserActionCall', 'UserFunctionCall'].includes(s.kind) && !s.candidateNode)
        && (s.kind !== 'ReturnStatement' || viewCalls.context().definitionKind === 'function'));
    if (!query && !entry) {
      const calls = viewCalls.definitionCalls(projectState), at = searched.findIndex(s => blockPaletteGroup(s) === 'action');
      searched.splice(at < 0 ? searched.length : at, 0, ...calls);
    }
    const speech=searched.find(s=>s.id==='Say');
    if(speech){const timed=createBlock('Say',{idPrefix:viewVars.viewId+'-timed'});timed.inputs.seconds=createBlock('NumberLiteral',{idPrefix:viewVars.viewId+'-seconds'});timed.inputs.seconds.fields.value=viewVars.options.tutorialActive?.()?1:2;searched.splice(searched.indexOf(speech),0,{...speech,candidateNode:timed,candidateKey:'timed-speech',searchLabel:entry?'話す':'ことばと 時間を 決めて 話す'});}
    // はじめて: the loop comes with its number of times (F-03); what it repeats goes into its hole, from the next block
    // put in or the blocks below it (E-03).
    const loopAt = entry ? searched.findIndex(s => s.id === 'RepeatCount' && !s.candidateNode) : -1;
    if (loopAt >= 0) {
      const loop = createBlock('RepeatCount', { idPrefix: viewVars.viewId + '-loop', draft: true, allowHoles: true }), count = createBlock('NumberLiteral', { idPrefix: viewVars.viewId + '-count' });
      count.fields.value = 3; loop.inputs.count = count;
      searched.splice(loopAt, 1, { ...searched[loopAt], candidateNode: loop, candidateKey: 'entry-repeat' });
    }
    let candidates = searched.filter(
      (s) =>
        (entry || query || !viewVars.category || (viewVars.category === 'basic'
          ? BASIC_BLOCK_SCHEMA_IDS.has(s.id)
          : blockPaletteGroup(s) === viewVars.category)) &&
        (entry || viewVars.paletteMode === 'all' || s.category === viewVars.paletteMode) &&
        (!entry || s.id !== 'Say' || s.candidateKey === 'timed-speech') &&
        (unitChoice || s.id !== 'QuantityLiteral') && (unitChoice || !ADVANCED_ONLY_SCHEMA_IDS.has(s.id)),
    );
    // はじめて too lists only what can go in here, so its blocks fit one page; one plain line says why some are gone (F2-12).
    const listed = candidates.length;
    if (!viewVars.showOutside)
      candidates = candidates.filter((s) => viewCalls.paletteAvailability(s, location).enabled);
    const hiddenAtEntry = entry && candidates.length < listed;
    if ((entry || viewVars.category === 'basic') && !query) {
      const order = entry ? ENTRY_PALETTE_ORDER : [...BASIC_BLOCK_SCHEMA_IDS];
      candidates.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    }
    const lesson=viewVars.options.lessonCandidate?.();
    if(lesson){
      // (a lesson's block has its schema)
      const candidate={...BLOCK_SCHEMA_BY_ID.get(lesson.node.schemaId)!,candidateNode:lesson.node,candidateKey:'lesson-'+lesson.key,lessonKey:lesson.key,searchLabel:lesson.label};
      const at=candidates.findIndex(item=>item.id===candidate.id);
      if(at<0)candidates.push(candidate);else candidates.splice(at,1,candidate);
    }
    // Keep the normal palette visible: a lesson guides a choice, never makes it.
    const scroll = viewVars.paletteList.scrollTop;
    viewVars.paletteList.replaceChildren();
    // A heading is no block: a search for ふれたとき or a key says where the body's きっかけ is chosen (F2-11).
    const headingWord = query && [['ふれたとき', /ふれ(?:た|る)とき|さわ(?:った|る)とき|あた(?:った|る)とき|ぶつか(?:った|る)とき/] as const, ['キーを おしたとき', /^(?:すぺーす|えんたー|えすけーぷ)(?:きー)?$|きーを?お(?:した|す|された)とき/] as const]
      .find(([, re]) => re.test(normalizeSearchText(query).replace(/[「」]/g, '')))?.[0];
    if (headingWord)
      viewVars.paletteList.append(viewCalls.E('p', 'blockui-empty blockui-heading-hint', headingWord + 'に 動かすには、本文の 上の「いつ動く？」で「' + headingWord + '」を えらんでね'));
    if (hiddenAtEntry)
      viewVars.paletteList.append(viewCalls.E('p', 'blockui-empty blockui-entry-hidden', viewCalls.context().targetId === 'stage'
        ? '画面では、動きと すがたの ブロックは 使えないよ。キャラクターを えらぶと 使えるよ'
        : 'ここで 使えない ブロックは かくして いるよ'));
    for (const schema of candidates) {
      const a = viewCalls.paletteAvailability(schema, location),
        item = viewCalls.E('div', 'blockui-palette-item', null, {
          'data-palette-tone': blockPaletteGroup(schema),
        }),
        reason = viewCalls.E(
          'small',
          'blockui-unavailable',
          a.reason || 'この ばしょでは 使えないよ',
        );
      const b = viewCalls.button(
        '',
        'palette-add',
        () => {
          // The list was checked at the end of the body (PERF-01): a press checks the place the block really goes.
          const real = a.enabled ? a : viewCalls.paletteAvailability(schema, viewVars.destination || viewCalls.defaultDestination(), true);
          if (!real.enabled) {
            if (real.reason) reason.textContent = real.reason;
            reason.hidden = false;
            viewCalls.announce(real.reason || a.reason, true);
            return;
          }
          paletteAdd(schema);
        },
        {
          'data-blockui-schema': schema.candidateKey==='timed-speech'?'Say:timed':schema.id,
          'data-schema-id': schema.id,
          'data-lesson-block': schema.lessonKey || '',
          // The tip says what the block is (F-21); why it cannot go in here is said when it is pressed.
          title: schema.searchLabel || schema.description || schema.label,
          // The block's name in 「 」, so a name such as 〜のところへ行く reads apart from を入れる (B-15).
          'aria-label': '「' + (schema.searchLabel || schema.label) + '」を入れる',
          'data-search-binding': schema.candidateKey || '',
          'aria-disabled': !a.enabled,
        },
      );
      b.disabled = viewVars.isLocked();
      (b as BlockElement)._akariSearchCandidate = schema;
      // A rule is put in with the button only: it has no place among the sentences of a body.
      if (schema.category !== 'rule') {
        b.dataset.blockuiDrag = 'palette';
        b.dataset.blockuiDragSchema = schema.id;
      }
      try {
        b.append(viewCalls.faceRuby(viewCalls.previewNode(schema, a.node)));
        // はじめて lists one speech block, so it needs no caption apart from the others (FM2-15).
        if (schema.binding||schema.lessonKey||schema.searchCaption||(schema.candidateKey==='timed-speech'&&!entry)) b.append(viewCalls.E('small', 'blockui-bound-name', schema.searchLabel));
      } catch (_) {
        b.textContent = viewCalls.paletteLabel(schema);
      }
      item.append(b);
      reason.hidden = a.enabled;
      if (!a.enabled) item.append(reason);
      viewVars.paletteList.append(item);
    }
    if (!candidates.length && !viewVars.options.tutorialActive?.())
      viewVars.paletteList.append(
        viewCalls.E(
          'p',
          'blockui-empty',
          // A search already looks through every なかま: it asks for other words.
          query ? '「' + viewVars.searchText.trim() + '」に 合う ブロックが ないよ。ほかの ことばで さがして みてね。れい：うごく・まつ・いう'
          // The work has no てじゅん or 答えを もとめる yet: the toolbar's 自分で作ったブロック makes one (F2-06).
          : viewVars.category === 'action' && !(projectState?.actions?.length || projectState?.functions?.length)
            ? (document.body.dataset.uiLevel === 'basic' ? '自分で作ったブロックは まだ ないよ。「くわしく」に すると 作れるよ' : '自分で作ったブロックは まだ ないよ。「キャラクター・部品」の 下の「自分で作ったブロック」で 作れるよ')
          : location?.input
            ? 'ここに 入れられる ブロックが ないよ。なかまを かえてね。「ブロックの しゅるい」の「使えないブロックも見せる」で、使えない わけも 見られるよ。つなぐブロックを ふやす ときは「＋ ここに入れる」を おしてね'
            : 'この ばしょで 使える ブロックが ないよ。なかまを かえてね。「ブロックの しゅるい」の「使えないブロックも見せる」で、使えない わけも 見られるよ。',
        ),
      );
    if(!viewVars.options.tutorialActive?.()&&viewVars.category&&!query&&!candidates.length)viewVars.paletteList.append(viewCalls.button('すべての なかまで さがす','search-all',()=>{viewVars.category='';viewVars.categoryExplicit=false;renderPalette();viewVars.search.focus();}));
    viewVars.paletteList.scrollTop = scroll;
    if (kept && !viewVars.isLocked() && (!viewVars.doc.activeElement || viewVars.doc.activeElement === viewVars.doc.body))
      ([...viewVars.palette.querySelectorAll<HTMLElement>(viewVars.PALETTE_KEYS)].find(n => viewCalls.paletteKey(n) === kept) ||
        viewVars.palette.querySelector<HTMLElement>('[data-blockui-action="palette-add"]') || viewVars.search).focus({ preventScroll: true });
    scheduleGeometry();
    viewVars.options.onPresentation?.();
  }
  function actorTool(node: BlockTree) {
    const field = viewCalls.schemaOf(node)?.fields.find(f => f.type === 'actor-ref' && f.key === 'actorRef');
    if (!field || viewVars.options.readOnly) return null;
    const owner = node.schemaId === 'ActorQualifiedRead', details = editDisclosure(node, 'actorRef', owner ? 'だれの' : 'だれが', 'blockui-who');
    // (a disclosure has its summary)
    details.querySelector('summary')!.setAttribute('aria-label', (owner ? 'だれのかを えらぶ: ' : 'だれが するかを えらぶ: ') + viewCalls.subjectName(node));
    details.append(fieldControl(node, field, false, true));
    return details;
  }
  // (a block drawn has its schema; a field's value is of the field's kind, which each branch below reads)
  function fieldControl(node: BlockTree, field: SchemaItem, annotation = false, tool = false) {
    // A block shown only to read (すべての本文) reads like its code too: the subject only where the code writes one.
    if (field.type === 'actor-ref' && !tool) return viewCalls.subjectFace(node, field);
    const value = annotation ? node.annotations[field.key] : node.fields[field.key],
      wrap = viewCalls.E(['actor-ref', 'heading', 'argument-names'].includes(field.type) ? 'div' : 'label', 'blockui-field', null, { 'data-field-type': field.type }),
      title = viewCalls.E('span', 'blockui-field-label', field.label),
      attrs = {
        'data-block-id': node.id,
        [annotation ? 'data-blockui-annotation' : 'data-blockui-field']: field.key,
        'aria-label': viewCalls.joinAccessibleName(viewCalls.schemaOf(node)!.label, field.label),
      };
    let input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    if (['actor-ref', 'heading', 'argument-names'].includes(field.type)) {
      if (viewVars.options.readOnly) {
        const actorText: (actor: ActorRef | undefined) => string = actor => actor?.kind === 'named' ? actor.name : actor?.kind === 'all' || (!actor && field.everyone) ? 'みんな' : '自分';
        // (a heading's filter is there when its key or message is)
        const text = field.type === 'actor-ref' ? actorText(value as ActorRef | undefined)
          : field.type === 'argument-names' ? (value as string[] | undefined || []).join('、')
            : value ? (eventText((value as BlockHeading).event, (value as BlockHeading).filter) || (value as BlockHeading).event) + ((value as BlockHeading).actorRef?.kind === 'named' ? '、' + (value as BlockHeading).actorRef.name : '') +
              ((value as BlockHeading).filter?.key !== undefined ? '、キー「' + keySurface((value as BlockHeading).filter!.key) + '」'
                : (value as BlockHeading).filter?.message !== undefined ? '、合図「' + (value as BlockHeading).filter!.message + '」' : '') : '本文で決める';
        wrap.append(title, viewCalls.E('span', 'blockui-readonly-value', text, attrs));
        return wrap;
      }
      // The group transports a structured value through the existing atomic
      // pending editor. Children are controls, never a JSON/source textbox.
      const group = viewCalls.E('fieldset', 'blockui-structured-field', null, { ...attrs, tabindex: '-1' });
      group.append(viewCalls.E('legend', 'blockui-field-label', field.label));
      // (a field made of parts holds what its controls read: StructuredValue)
      let changed = false, readValue: () => StructuredValue = () => value as StructuredValue, restore = () => {};
      // (a control is made in its row of the group: its parent is that row)
      const control = <K extends 'input' | 'select'>(label: string, type: K, suffix: string, initial = '') => {
        const row = viewCalls.E('label', 'blockui-structured-role'), child = viewCalls.E(type, '', null, {
          'data-block-id': node.id, 'data-blockui-structured-role': field.key + '.' + suffix,
          'aria-label': viewCalls.joinAccessibleName(field.label, label),
          ...(type === 'input' ? { type: 'text', spellcheck: 'false', autocomplete: 'off' } : {}),
        });
        row.append(viewCalls.E('span', 'blockui-field-label', label), child); group.append(row);
        // (a view made without readOnly can be edited: the element reads undefined as false)
        child.value = initial; (child as DisabledWrites).disabled = viewVars.isLocked() || viewVars.options.readOnly;
        return child;
      };
      const choice = (label: string, suffix: string, values: readonly (readonly [string, string])[], initial: string) => {
        const child = control(label, 'select', suffix);
        for (const [v, label] of values) child.append(viewCalls.E('option', '', label, { value: v }));
        child.value = initial; return child;
      };
      // A wait also offers みんな: the whole flow waits, not one part.
      const actor = (initial: ActorRef | undefined, prefix = '', everyone = false, particle = false) => {
        const first = initial?.kind || (everyone ? 'all' : 'self');
        const kind = choice('だれの', prefix + 'kind', [...(everyone ? [['all', 'みんな'] as const] : []), ['self', '自分'], ['named', '名前で えらぶ']], first);
        const name = control('だれかの名前', 'input', prefix + 'name', initial?.name || '');
        // A sentence's named subject is written with は or が (the same meaning).
        const mark = particle ? choice('「は」か「が」', prefix + 'particle', [['は', 'は'], ['が', 'が']], initial?.particle || 'は') : null;
        const names = viewCalls.E('datalist', '', null, { id: viewVars.viewId + '-actor-' + node.id + '-' + field.key + prefix });
        for (const text of [viewCalls.project()?.stage?.name, ...(viewCalls.project()?.components || []).map(c => c.name)].filter(Boolean))
          names.append(viewCalls.E('option', '', null, { value: text }));
        name.setAttribute('list', names.id); group.append(names);
        const sync = () => { name.parentElement!.hidden = kind.value !== 'named'; if (mark) mark.parentElement!.hidden = kind.value !== 'named'; };
        sync(); viewCalls.listen(kind, 'change', sync);
        return { read: (): ActorChoice => kind.value === 'named' ? { kind: 'named', name: name.value, ...(mark?.value === 'が' ? { particle: 'が' } : {}) } : { kind: kind.value },
          restore: () => { kind.value = first; name.value = initial?.name || ''; if (mark) mark.value = initial?.particle || 'は'; sync(); } };
      };
      if (field.type === 'actor-ref') {
        // (a block that holds sentences writes its subject with は, マスコットは、3回くり返す: it offers no は or が)
        const subject = actor(value as ActorRef | undefined, '', !!field.everyone, node.schemaId !== 'ActorQualifiedRead' && field.key === 'actorRef' &&
          !BLOCK_SCHEMA_BY_ID.get(node.schemaId)?.bodies.length);
        readValue = subject.read; restore = subject.restore;
      } else if (field.type === 'argument-names') {
        const mode = choice('入れるものの わたし方', 'mode', [['positional', '書いた じゅんに わたす'], ['named', '名前を つけて わたす']], value === undefined ? 'positional' : 'named');
        const names = (node.inputs.args || []).map((_, i) => control('入れるもの' + (i + 1) + 'の名前', 'input', String(i), (value as string[] | undefined)?.[i] || ''));
        const sync = () => { for (const name of names) name.parentElement!.hidden = mode.value !== 'named'; };
        sync(); viewCalls.listen(mode, 'change', sync);
        readValue = () => mode.value === 'named' ? names.map(name => name.value) : undefined;
        restore = () => { mode.value = value === undefined ? 'positional' : 'named'; names.forEach((name, i) => { name.value = (value as string[] | undefined)?.[i] || ''; }); sync(); };
      } else {
        const currentEvent=(value as BlockHeading | undefined)?.event||viewCalls.context().event||'start',currentActor: ActorRef=(value as BlockHeading | undefined)?.actorRef||{kind:'self'},currentFilter=value?(value as BlockHeading).filter:viewCalls.context().filter;
        const actorName: (ref: ActorRef | undefined) => string = ref => ref?.kind==='named' ? ref.name : viewCalls.project()?.components.find(c=>c.id===viewCalls.context().targetId)?.name||viewCalls.project()?.stage?.name||'この 本文';
        // (a part of the bodies is a block, a list of blocks or an object of them; only a block has fields)
        const owners=new Set([actorName(currentActor)]),scan: (part: unknown) => void=part=>{
          if(!part||typeof part!=='object')return;
          if((part as Partial<BlockTree>).fields?.actorRef)owners.add(actorName((part as BlockTree).fields.actorRef!.kind==='self'?currentActor:(part as BlockTree).fields.actorRef));
          for(const [key,child]of Object.entries(part))if(key!=='units'&&child&&typeof child==='object')Array.isArray(child)?child.forEach(scan):scan(child);
        };scan(node.bodies);scan(node.inputs.rules);
        const location=viewCalls.session()?.nodeMap?.get(node.bodies.body?.[0]?.id)?.surface,range=location?.range||location?.extent,
          preview=range?viewCalls.session()!.sourceText.slice(range.start,range.end):node.bodies.body?.length?viewCalls.schemaOf(node.bodies.body[0])!.label:'まだ ブロックが ないよ';
        group.append(viewCalls.E('p','blockui-trigger-scope',`かえる 本文：${[...owners].join('・')} ／ ${eventText(currentEvent,currentFilter)}\n${preview}
この 本文の きっかけだけを かえるよ。ほかの 本文は そのままだよ。`));
        // The stage touches nothing, so its bodies are not offered ふれたとき.
        const stageOwned = viewCalls.context().targetId === 'stage' && currentActor?.kind !== 'named';
        const event = choice('いつ動く？', 'event', Object.entries(EVENT_LABELS).filter(([key]) => !MEIJIN_EVENTS.includes(key) && !(key === 'touchStart' && stageOwned && currentEvent !== 'touchStart')), currentEvent);
        event.setAttribute('aria-label','いつ動く？');event.parentElement!.classList.add('blockui-trigger-choice');
        // ふれたとき: what is touched — the other parts in the order of 作品, the stage edge, and its four sides. A new touch
        // body touches the stage edge until another is chosen.
        const ownerName = actorName(currentActor);
        const touchTargets: [string, string][] = [...(viewCalls.project()?.components || []).filter(c => c.name !== ownerName).map<[string, string]>(c => [c.name, '「' + c.name + '」']), ...Object.entries(EDGE_TARGETS)];
        if (typeof currentFilter?.target === 'string' && !touchTargets.some(([v]) => v === currentFilter.target)) touchTargets.push([currentFilter.target, isEdgeTarget(currentFilter.target) ? EDGE_TARGETS[currentFilter.target] : '「' + currentFilter.target + '」']);
        const touchTarget = choice('なにに ふれたとき？', 'touch.target', touchTargets, currentFilter?.target ?? '端');
        touchTarget.parentElement!.classList.add('blockui-trigger-choice');
        const syncTouch = () => { touchTarget.parentElement!.hidden = event.value !== 'touchStart'; };
        syncTouch(); viewCalls.listen(event, 'change', syncTouch);
        const details=viewCalls.E('details','blockui-trigger-details');details.append(viewCalls.E('summary','','もっと えらぶ（だれ・どの キー・どの 合図）'));group.append(details);
        const detailStart=group.children.length;
        const enabled = choice('きっかけ', 'enabled', [['no', '本文だけ'], ['yes', 'きっかけを 決める']], value ? 'yes' : 'no');
        const subject = actor(currentActor, 'actorRef.');
        const filter = choice('どれで動くか', 'filter.kind', [['all', 'すべて'], ['key', 'このキー'], ['message', 'この合図']], currentFilter?.key !== undefined ? 'key' : currentFilter?.message !== undefined ? 'message' : 'all');
        const filterValue = control('キー・合図の文字', 'input', 'filter.value', currentFilter?.key !== undefined ? keySurface(currentFilter.key) : currentFilter?.message ?? '');
        const signals=document.createElement('datalist');signals.id=viewVars.viewId+'-signals-'+node.id;group.append(signals);
        // A registered extension event is chosen by its Japanese names; the signal's name is then its 拡張:拡張ID/機能ID.
        // えらばない empties a name that was an event's, and leaves another name as it is.
        const events=extensionEventChoices(),extension=events.length?choice('かくちょうの きっかけ','filter.extension',[['','えらばない'],...events.map(e=>[e.message,e.label] as const)],''):null;
        const matchExtension=()=>{if(extension)extension.value=events.some(e=>e.message===filterValue.value)?filterValue.value:'';};
        if(extension){extension.parentElement!.classList.add('blockui-trigger-choice');viewCalls.listen(extension,'change',()=>{if(extension.value)filterValue.value=extension.value;else if(events.some(e=>e.message===filterValue.value))filterValue.value='';});viewCalls.listen(filterValue,'input',matchExtension);}
        const sync = () => {
          for (const option of filter.options) option.disabled = (option.value === 'key' && event.value !== 'keyDown') || (option.value === 'message' && event.value !== 'message');
          if (filter.selectedOptions[0]?.disabled) filter.value = 'all';
          filterValue.parentElement!.hidden = filter.value === 'all';
          if(extension)extension.parentElement!.hidden=filter.value!=='message';matchExtension();
          const names=viewCalls.context().signalNames?.()||{sent:[],received:[]},values=filter.value==='message'?[...names.sent,...names.received]:['スペース','上','下','左','右','エンター','エスケープ'];
          signals.replaceChildren(...[...new Set(values)].map(value=>{const option=document.createElement('option');option.value=value;return option;}));
          filterValue.setAttribute('list',signals.id);
          for (const child of group.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input,select'))
            if (child !== enabled&&child!==event&&child!==touchTarget) child.disabled = viewVars.isLocked() || viewVars.options.readOnly || enabled.value !== 'yes';
        };
        for(const child of [...group.children].slice(detailStart))details.append(child);
        viewCalls.listen(details,'input',()=>{group.dataset.triggerDetailed='true';group.dataset.triggerMetadataOnly='false';});
        viewCalls.listen(details,'change',()=>{group.dataset.triggerDetailed='true';group.dataset.triggerMetadataOnly='false';});
        sync(); viewCalls.listen(enabled, 'change', sync); viewCalls.listen(event, 'change',()=>{enabled.value='yes';group.dataset.triggerMetadataOnly=String(!value&&group.dataset.triggerDetailed!=='true');sync();}); viewCalls.listen(filter, 'change', sync);
        // What is touched is chosen like the event: a body with no heading keeps its text and takes the partner.
        viewCalls.listen(touchTarget, 'change',()=>{enabled.value='yes';group.dataset.triggerMetadataOnly=String(!value&&group.dataset.triggerDetailed!=='true');sync();});
        readValue = () => {
          if (enabled.value !== 'yes') return undefined;
          const heading: HeadingChoice = { event: event.value, actorRef: subject.read() };
          if (event.value === 'touchStart') heading.filter = { target: touchTarget.value };
          else if (filter.value !== 'all') heading.filter = filter.value === 'key' ? { key: keyName(filterValue.value) } : { message: filterValue.value };
          else if (currentFilter === null) heading.filter = null;
          return heading;
        };
        restore = () => {
          enabled.value = value ? 'yes' : 'no'; event.value = currentEvent; subject.restore();
          touchTarget.value = currentFilter?.target ?? '端'; syncTouch();
          filter.value = currentFilter?.key !== undefined ? 'key' : currentFilter?.message !== undefined ? 'message' : 'all';
          filterValue.value = currentFilter?.key !== undefined ? keySurface(currentFilter.key) : currentFilter?.message ?? ''; sync();
        };
      }
      Object.defineProperty(group, 'value', { get: () => changed ? readValue() : value,
        set: () => { changed = false; restore(); } });
      group.dataset.focusKey = node.id + ':field:' + field.key;
      // Change events from selects need the same staging as input events.
      viewCalls.listen(group, 'input', () => { changed = true; });
      viewCalls.listen(group, 'change', () => { changed = true; group.dispatchEvent(new viewVars.doc.defaultView.Event('input', { bubbles: true })); });
      if (!viewVars.options.readOnly) {
        // (the group has its value: defined above)
        editInput(group as StructuredInput, node, field, annotation);
        if(field.type==='heading')group.append(viewCalls.button('この 本文の きっかけを かえる','heading-commit',()=>flush({explicit:true})),viewCalls.button('かえるのを やめる','heading-cancel',()=>cancel()));
        // (a change comes from a control; the focus goes to an element or nowhere)
        // A choice that shows a name still to write (名前で えらぶ, 名前を つけて わたす) waits for it: the name is taken
        // when it is written and left (focusout below), not as an empty name now.
        viewCalls.listen(group, 'change', event => { if (field.type!=='heading'&&(event.target as Element).tagName === 'SELECT'&&
          ![...group.querySelectorAll('input')].some(input => !input.closest('[hidden]') && !input.value.trim())) flush(); });
        viewCalls.listen(group, 'focusout', event => {
          if (field.type!=='heading'&&!group.contains(event.relatedTarget as Element | null) && !(event.relatedTarget as Element | null)?.closest('[data-blockui-action="cancel"],[data-blockui-action="edit-text"],[data-blockui-text-action]'))
            flushToTarget(event.relatedTarget as Element | null);
        });
      }
      wrap.append(group);
      return wrap;
    }
    if (field.type === 'unit' || field.type === 'direction') {
      input = viewCalls.E('select', '', null, attrs);
      // The direction words of the language (右へ, 上へ, 前へ …); a field may offer only some of them.
      const choices = field.type === 'unit' ? ['歩', '度', '秒', '回', '番目', '点', '個', '％', 'Hz'].map(v => [v, v])
        : [['right', '右'], ['left', '左'], ['up', '上'], ['down', '下'], ['forward', '前'], ['backward', '後ろ']].filter(([v]) => !field.choices || field.choices.includes(v));
      for (const [v, label] of choices) input.append(viewCalls.E('option', '', label, { value: v }));
      // (a unit and a direction are texts)
      input.value = value as string;
    } else if (field.type === 'boolean' || field.type === 'qualifier') {
      input = viewCalls.E('select', '', null, attrs);
      const values =
        field.type === 'boolean'
          ? field.key === 'hasElse'
            ? [
                ['true', 'あり'],
                ['false', 'なし'],
              ]
            : [
                ['true', 'あてはまる'],
                ['false', 'あてはまらない'],
              ]
          : [
              ['none', 'とくに なし'],
              ['exact', '【 】'],
              ['self', '自分の'],
              ['project', '作品の'],
            ];
      for (const [v, l] of values) input.append(viewCalls.E('option', '', l, { value: v }));
      input.value =
        field.type === 'qualifier' ? (value === null ? 'none' : value as string) : String(value);
      if (field.type === 'qualifier') {
        input.classList.toggle('blockui-qualifier-empty', value === null);
        input.title =
          '使う ばしょ: ' + (values.find((v) => v[0] === input.value)?.[1] || 'とくに なし');
      }
    } else if (field.type === 'comment' || field.multiline && /[\r\n]/.test(value)) {
      input = viewCalls.E('textarea', field.type === 'comment' ? 'blockui-comment-input' : 'blockui-multiline-input', null, {
        ...attrs,
        rows: '1',
        spellcheck: 'false',
      });
      // (a memo and a text are texts)
      input.value = value as string;
    } else {
      input = viewCalls.E('input', '', null, {
        ...attrs,
        type: 'text',
        spellcheck: 'false',
        autocomplete: 'off',
        ...(field.type === 'number' ? { inputmode: 'decimal' } : {}),
      });
      // (a number's field holds a number; another is shown as a text)
      input.value = field.type === 'number' && value !== undefined ? decimalSource(value as number) : viewCalls.edgeShown(node, field, value) as string ?? '';
      if (node.schemaId === 'Hole:expression' && field.type === 'number') input.dataset.expressionHole = 'true';
    }
    // (a memo is typed in a text box or a text area; a SELECT is a choice)
    if (annotation) {
      (input as HTMLInputElement | HTMLTextAreaElement).placeholder = '※ メモ';
      title.textContent = field.label + '（※から）';
    }
    if (viewVars.options.readOnly) {
      const text = field.type === 'qualifier' && value === null ? ''
        : input.tagName === 'SELECT' ? (input as HTMLSelectElement).selectedOptions[0]?.textContent || input.value : input.value;
      wrap.append(title, viewCalls.E('span', 'blockui-readonly-value', text, {
        ...attrs, 'aria-label': field.label + '：' + text,
      }));
      return wrap;
    }
    input.disabled = viewVars.isLocked();
    if (field.type === 'string' && !annotation) {
      const editText = viewCalls.button('全部見て なおす', 'edit-text', () => {
        if (viewVars.isLocked()) return;
        const dialog = viewCalls.E('dialog', 'blockui-text-dialog'),
          heading = viewCalls.E('h2', '', '文字を なおす'),
          editor = viewCalls.E('textarea', '', null, { rows: '8', wrap: 'soft', spellcheck: 'false', 'aria-label': '文字の全部' }),
          controls = viewCalls.E('div', 'blockui-text-dialog-controls'),
          apply = viewCalls.E('button', '', '決める', { type: 'button', 'data-blockui-text-action': 'commit' }),
          discard = viewCalls.E('button', '', 'この文字を なおすのを やめる', { type: 'button', 'data-blockui-text-action': 'cancel' });
        editor.value = viewVars.pending?.input === input ? input.value : String(viewCalls.edgeShown(node, field, viewVars.index.get(node.id)?.node.fields[field.key] ?? value) ?? '');
        editor.dataset.focusKey = node.id + ':full-text:' + field.key;
        const close: (committed: boolean) => void = committed => {
          if (committed && !flush({ focus: false }).ok) { editor.focus(); return; }
          dialog.close(); dialog.remove();
          if (!committed) { cancelField(); viewRedraw.render({ force:true }); }
        };
        editInput(editor, node, field, false);
        viewCalls.listen(apply, 'click', () => close(true));
        viewCalls.listen(discard, 'click', () => close(false));
        viewCalls.listen(dialog, 'cancel', event => { event.preventDefault(); close(false); });
        viewCalls.listen(dialog, 'keydown', event => {
          if (event.key === 'Escape' && !event.isComposing) { event.preventDefault(); event.stopPropagation(); close(false); }
        }, { capture: true });
        controls.append(apply, discard); dialog.append(heading, editor, controls); viewVars.root.append(dialog);
        dialog.showModal(); editor.focus();
        // (a text is typed in a text box or a text area)
        editor.setSelectionRange((input as HTMLInputElement | HTMLTextAreaElement).selectionStart ?? editor.value.length, (input as HTMLInputElement | HTMLTextAreaElement).selectionEnd ?? editor.value.length);
      }, { 'aria-label': '文字を全部見て なおす' });
      editText.classList.add('blockui-edit-text'); wrap.append(editText);
    }
    input.dataset.focusKey = node.id + ':' + (annotation ? 'annotation:' : 'field:') + field.key;
    if (input.tagName === 'INPUT') {
      viewCalls.listen(input, 'input', () => {
        input.title = input.value;
        scheduleGeometry();
      });
      input.title = input.value;
    }
    if (field.key === 'hasElse') {
      viewCalls.listen(input, 'change', () => {
        const result = operate({ type: 'else', id: node.id, enabled: input.value === 'true' });
        if (!result.ok) {
          input.value = node.fields.hasElse ? 'true' : 'false';
          input.focus({ preventScroll: true });
        }
      });
    } else editInput(input, node, field, annotation);
    if (field.type === 'name' || field.type === 'string') {
      const suggestions = viewCalls.namesFor(node, field);
      if (suggestions.length) {
        const dl = viewCalls.E('datalist', '', null, {
          id: viewVars.viewId + '-options-' + node.id + '-' + field.key,
        });
        for (const name of suggestions) dl.append(viewCalls.E('option', '', null, { value: name }));
        input.setAttribute('list', dl.id);
        wrap.append(dl);
      }
    }
    wrap.append(title, input);
    return wrap;
  }
  function completeMove(location: InsertLocation, source = viewVars.moving) {
    if (!source) return;
    const info = viewVars.index.get(source.id);
    if (!info) {
      cancel();
      return;
    }
    // (a block of the view has its schema)
    const kind = viewCalls.schemaOf(info.node)!.category;
    if ((kind === 'statement') !== !!location.body) {
      viewCalls.announce('つなぐブロックは 本文へ、はめるブロックは あいている ところへ もって いってね', true);
      return;
    }
    const parent = viewVars.index.get(location.parentId), carried = source.type === 'run' ? viewCalls.runIds(source.id) : [source.id];
    if (
      source.type !== 'copy' &&
      carried.some(id => location.parentId === id || parent?.ancestors.includes(id))
    ) {
      viewCalls.announce('自分の 中には もって いけないよ', true);
      return;
    }
    if (kind === 'statement') {
      // An empty enclosure moved above blocks takes them in, as a new one does (E-03).
      const wraps = source.type === 'move' && viewCalls.wrapCount(viewCalls.schemaOf(info.node), info.node, location, source.id);
      // (a sentence goes to a body, a value to a hole: checked above)
      const result = operate({
        type: source.type === 'copy' ? 'duplicate' : source.type === 'run' ? 'move-run' : wraps ? 'wrap' : 'move',
        id: source.id,
        ...location as BodyPlace,
      });
      if (result.ok) {
        viewVars.moving = null;
        viewVars.destination = null;
        viewRedraw.render({ force: true });
        // The block moved keeps the focus, as after putting one in or あとへ (AX-10).
        const placed = viewCalls.placedAt(location, info.node.schemaId);
        if (placed) focus({ id: placed });
        if (wraps) viewCalls.attendEmptyValue(placed);
      }
      return;
    }
    // A value goes only where the list would put it (LANGUAGE: a place it cannot go is grey, and dropping there puts
    // nothing): 3 is no partner to touch (S304). A mistake the value already had on its own line goes with it.
    const fits = viewCalls.availability(info.node.schemaId, location, info.node, source.id);
    if (!fits.enabled) { viewCalls.announce(fits.reason || 'そこには 入れられないよ', true); return; }
    if (source.type === 'copy') {
      const result = operate({ type: 'expression', ...location as InputPlace, node: viewCalls.copy(info.node) });
      if (result.ok) {
        viewVars.moving = null;
        viewRedraw.render({ force: true });
      }
      return;
    }
    if (viewCalls.sameLocation(viewCalls.listLocation(info), location)) {
      viewVars.moving = null;
      viewCalls.announce('もとと 同じ ばしょだよ');
      updateControls();
      return;
    }
    viewVars.moving = null;
    viewVars.replacement = { sourceId: source.id, location };
    viewCalls.notifyPending();
    renderReplacement();
    updateControls();
  }
  function renderReplacement() {
    viewVars.promptArea.replaceChildren();
    viewVars.promptArea.hidden = !viewVars.replacement;
    if (!viewVars.replacement) return;
    const title = viewCalls.E('h4', '', 'もとの ばしょに 入れる ブロックを えらぶ'),
      note = viewCalls.E(
        'p',
        '',
        'もとの ばしょを 空っぽには できないよ。えらんだ ブロックを はじめの 中身で おいてから、もっていく 先へ つなぐよ。',
      ),
      select = viewCalls.E('select', '', null, {
        'aria-label': 'もとの ばしょに 入れる ブロック',
        'data-blockui-replacement-schema': 'true',
      });
    // The blocks the list offers in the place the value leaves (not where it goes), at this level, named by the list's なかま
    // (FCB-21). A call of a made block is not offered: made here it would name no block of the work (the list offers the work's
    // own by their names).
    const advanced = document.body.dataset.uiLevel === 'advanced', place = viewCalls.listLocation(viewVars.index.get(viewVars.replacement.sourceId));
    for (const s of BLOCK_SCHEMAS.filter((x) => x.category === 'expression' && !x.draftOnly && (advanced || (x.id !== 'QuantityLiteral' && !ADVANCED_ONLY_SCHEMA_IDS.has(x.id))) &&
      !['UserActionCall', 'UserFunctionCall'].includes(x.id) && viewCalls.availability(x.id, place).enabled))
      select.append(viewCalls.E('option', '', (viewVars.PALETTE_GROUP_LABELS.get(blockPaletteGroup(s)) || s.palette) + ' / ' + s.label, { value: s.id }));
    // A number first when the place takes one, else the first block offered; with none the button cannot be pressed.
    select.value = [...select.options].some((o) => o.value === 'NumberLiteral') ? 'NumberLiteral' : select.options[0]?.value ?? '';
    const accept = viewCalls.button('このブロックを おいて もっていく', 'confirm-expression-move', () => {
      // (the button is there only while a value waits for what to leave in its place, in a hole)
      // (made as the check made it, with the work's defaults: an input field's 中身 names an input field of the work)
      const action = viewVars.replacement!, checked = viewCalls.availability(select.value, place).node,
        made = checked || applyCreationDefaults(createBlock(select.value, { ...viewCalls.context(), ...blockCreationDefaults(viewCalls.project(), viewCalls.context().targetId), idPrefix: viewVars.viewId }), viewCalls.project(), viewCalls.context().targetId);
      viewVars.replacement = null;
      viewVars.onPending(null);
      const result = operate({
        type: 'expression-move',
        id: action.sourceId,
        ...action.location as InputPlace,
        replacement: made,
      });
      if (!result.ok) {
        viewVars.replacement = action;
        viewCalls.notifyPending();
      }
      renderReplacement();
      updateControls();
    });
    accept.disabled = !select.options.length;
    viewVars.promptArea.append(
      title,
      note,
      select,
      accept,
      viewCalls.button('もって いくのを やめる', 'cancel-expression-move', () => cancel()),
    );
    select.focus();
  }
  function removeBlock(node: Pick<BlockTree, 'id'>, info = viewVars.index.get(node.id)) {
    const result = operate({ type: 'remove', id: node.id });
    if (!result.ok && viewVars.index.get(info?.parentId)?.node.schemaId !== 'Script')
      viewCalls.announce(viewCalls.errorText(result.error || result.reason) + '。「いったん 使わない」で 入れかえるか、まとまりごと けしてね', true);
    if (result.ok) viewCalls.keepKeys();
    return result;
  }
  // The 「…」 after a sentence opens what changes it beyond its values (E-14): time, a second direction, 計算 …
  function extraDisclosure(node: BlockTree, label: string) {
    const extra = editDisclosure(node, 'extra', '…', 'blockui-extra'), extraControls = viewCalls.E('div', 'blockui-extra-controls');
    // (a disclosure has its summary)
    extra.querySelector('summary')!.setAttribute('aria-label', label);
    extra.append(extraControls);
    return { extra, extraControls };
  }
  // 「度に なおす」: a quantity with another unit takes the fixed one; 右に（15秒）度回る, a quantity in a quantity, becomes
  // 右に15度回る (the inner unit goes).
  function unitRepair(quantity: BlockTree, unit: string, nested: BlockTree | null) {
    if (viewVars.options.readOnly) return viewVars.doc.createDocumentFragment();
    const repair = viewCalls.button(unit + 'に なおす', 'unit-repair', () => nested
        // (a quantity has its value)
        ? operate({ type: 'replace', id: nested.id, node: viewCalls.copy(nested.inputs.value!) })
        : operate({ type: 'field', id: quantity.id, key: 'unit', value: unit }),
      { 'aria-label': 'たんいを ' + unit + 'に なおす', 'data-block-id': (nested || quantity).id });
    repair.disabled = viewVars.isLocked();
    return repair;
  }
  function focus(location: ViewPlace | number | null | undefined) {
    const value: ViewPlace = typeof location === 'number' ? { line: location } : location || {},
      point = viewCalls.resolveLocation(value),
      id = point.id || viewCalls.session()?.blockSelection;
    if (value.key && value.key !== viewCalls.session()?.ownerKey) return false;
    if (!id || !viewVars.index.has(id)) {
      viewVars.workspace.focus({ preventScroll: true });
      return false;
    }
    viewCalls.selection(
      id,
      point.body
        ? { body: point.body, line: viewVars.branchSourceLines.get(id + ':' + point.body) }
        : null,
    );
    viewCalls.revealNode(id);
    // (a hole is in a block: it has its place)
    if (viewVars.index.get(id)?.node.schemaId.startsWith('Hole:')) chooseDestination(viewCalls.listLocation(viewVars.index.get(id))!);
    if(viewVars.index.get(id)?.node.schemaId.startsWith('Hole:')&&viewVars.zoom<0.75)setZoom(1);
    const n = viewCalls.locationElement({ ...point, id });
    n?.focus({ preventScroll: true });
    n?.scrollIntoView({ block: 'center', inline: 'center' });
    return !!n;
  }
  function updateGeometry() {
    if (viewVars.destroyed) return;
    viewVars.world.style.setProperty('--blockui-content-width', Math.max(220, viewVars.workspace.clientWidth / viewVars.zoom) + 'px');
    viewCalls.updateFieldWidths();
    viewVars.world.style.transform = `scale(${viewVars.zoom})`;
    viewVars.world.style.setProperty('--blockui-scale', viewVars.zoom);
    viewVars.world.style.setProperty('--blockui-inverse-scale', 1 / viewVars.zoom);
    // Measure every shape before writing SVG attributes: alternating reads and
    // writes forces a whole-workspace layout for each block in a long body.
    const shapes = [
      ...viewVars.root.querySelectorAll<HTMLElement>('.blockui-node[data-shape-kind],.blockui-event-hat,.blockui-preview'),
    ]
      .map(viewCalls.measureShape)
      .filter(Boolean);
    for (const { svg, w, h, d } of shapes) {
      // (a shape has its path)
      const viewBox = `-1 -1 ${w + 2} ${h + 8}`,
        width = w + 2 + 'px',
        height = h + 8 + 'px',
        path = svg.querySelector('path')!;
      if (svg.getAttribute('viewBox') !== viewBox) svg.setAttribute('viewBox', viewBox);
      if (svg.style.width !== width) svg.style.width = width;
      if (svg.style.height !== height) svg.style.height = height;
      if (path.getAttribute('d') !== d) path.setAttribute('d', d);
    }
    viewVars.plane.style.width =
      Math.max(
        viewVars.workspace.clientWidth,
        1500,
        Math.ceil(viewVars.world.offsetWidth * viewVars.zoom + viewVars.workspace.clientWidth * 0.3),
      ) + 'px';
    viewVars.plane.style.height =
      Math.max(
        viewVars.workspace.clientHeight,
        1100,
        viewVars.planeFloor,
        Math.ceil(viewVars.world.offsetHeight * viewVars.zoom + viewVars.workspace.clientHeight * 0.4),
      ) + 'px';
    viewVars.zoomLabel.textContent = Math.round(viewVars.zoom * 100) + '%';
    viewVars.minus.disabled = viewVars.zoom <= 0.5;
    viewVars.plus.disabled = viewVars.zoom >= 2;
    viewCalls.placeNodeTools();
    placeBlockPopovers();
  }
  function closeBlockPopovers(target: Node | null, focusTraversal = false) {
    for (const menu of viewVars.workspace.querySelectorAll<HTMLDetailsElement>('.blockui-extra[open]')) {
      if (menu.contains(target)) continue;
      menu.open = false;
      viewVars.openEditors.delete(menu.dataset.blockuiDisclosure);
    }
    for (const panel of viewVars.workspace.querySelectorAll('.blockui-node-notices.blockui-open')) {
      const trigger = panel.closest('.blockui-node')?.querySelector(':scope > .blockui-node-head [data-blockui-action="notices"]');
      // Tab passes the other tools in this block's head before reaching its correction buttons.
      if (panel.contains(target) || trigger?.contains(target) || (focusTraversal && panel.closest('.blockui-node')?.contains(target))) continue;
      panel.classList.remove('blockui-open');
      panel.closest('.blockui-node')?.querySelector('[data-blockui-action="notices"]')?.setAttribute('aria-expanded', 'false');
    }
  }
  // Panels stay within the workspace and float over it, so opening one moves no block.
  function placeBlockPopovers() {
    const room = viewVars.workspace.getBoundingClientRect();
    for (const panel of viewVars.workspace.querySelectorAll<HTMLElement>('.blockui-extra[open] > .blockui-extra-controls,.blockui-node-notices.blockui-open')) {
      const box = panel.closest('.blockui-node'), parent = panel.offsetParent,
        anchor = box?.querySelector(':scope > .blockui-node-content > .blockui-node-main') || box;
      if (!parent || !anchor) continue;
      panel.style.minWidth = '0';
      panel.style.width = Math.max(1, Math.min(380, room.width - 16)) / viewVars.zoom + 'px';
      panel.style.maxWidth = Math.max(1, room.width - 16) / viewVars.zoom + 'px';
      panel.style.maxHeight = Math.max(1, room.height - 16) / viewVars.zoom + 'px';
      panel.style.overflowY = 'auto';
      const r = panel.getBoundingClientRect(), a = anchor.getBoundingClientRect(), origin = parent.getBoundingClientRect(),
        left = Math.max(room.left + 8, Math.min(a.left, room.right - 8 - r.width)),
        below = a.bottom + 2, above = a.top - r.height - 2,
        top = below + r.height <= room.bottom - 8 ? below : above >= room.top + 8 ? above : Math.max(room.top + 8, room.bottom - r.height - 8);
      panel.style.left = (left - origin.left) / viewVars.zoom + 'px';
      panel.style.right = 'auto';
      panel.style.top = (top - origin.top) / viewVars.zoom + 'px';
    }
  }
  function scheduleGeometry() {
    if (viewVars.destroyed || viewVars.geometryFrame !== null) return;
    viewVars.geometryFrame = viewVars.doc.defaultView.requestAnimationFrame(() => {
      viewVars.geometryFrame = null;
      updateGeometry();
    });
  }
  function setZoom(value: number, anchor: ViewPoint | null = null) {
    if (viewVars.drag?.started || viewVars.pan) return;
    const next = blockZoomCore(value),
      at = anchor || { x: viewVars.workspace.clientWidth / 2, y: viewVars.workspace.clientHeight / 2 },
      left = blockZoomScroll(viewVars.workspace.scrollLeft, at.x, viewVars.zoom, next),
      top = blockZoomScroll(viewVars.workspace.scrollTop, at.y, viewVars.zoom, next);
    viewVars.zoom = next;
    updateGeometry();
    viewVars.workspace.scrollLeft = left;
    viewVars.workspace.scrollTop = top;
    viewCalls.rememberViewState();
  }
  // 見わたす: the body fits the workspace both ways, but never below 75%, where a child could no longer read it, and
  // never above 100% (E-07). What is measured is the body's own blocks from the top left of the world, not the places
  // between them that span the workspace nor the room kept below the world.
  function fitBlocks() {
    const script = viewVars.world.querySelector('.blockui-script');
    if (!script) return;
    const box = viewVars.world.getBoundingClientRect();
    let right = 0, bottom = 0;
    for (const n of viewVars.world.querySelectorAll(':scope > .blockui-event-hat, .blockui-script > .blockui-node-content > .blockui-node-main > details > summary, .blockui-statement .blockui-node-main, .blockui-insertion-end')) {
      const r = n.getBoundingClientRect();
      if (!r.width && !r.height) continue;
      if (!n.classList.contains('blockui-insertion-end')) right = Math.max(right, (r.right - box.left) / viewVars.zoom);
      bottom = Math.max(bottom, (r.bottom - box.top) / viewVars.zoom);
    }
    // A body that fits at 100% stays at 100% (LANGUAGE.md 250); the margin is kept only for one that has to shrink.
    const fits = right <= viewVars.workspace.clientWidth && bottom <= viewVars.workspace.clientHeight,
      across = (viewVars.workspace.clientWidth - 24) / (right + 24),
      down = (viewVars.workspace.clientHeight - 24) / (bottom + 24);
    setZoom(fits ? 1 : Math.min(1, Math.max(0.75, Math.min(across, down))));
    viewVars.workspace.scrollTo({ top: 0, left: 0 });
    viewCalls.rememberViewState();
  }
  function observeMore() {
    if (!viewVars.bodyObserver && typeof IntersectionObserver === 'function')
      viewVars.bodyObserver = new IntersectionObserver(
        (entries) => {
          if (viewVars.destroyed || viewVars.pending || viewVars.drag || viewVars.pan || !viewVars.root.getClientRects().length) return;
          const entry = entries.find(
            (e) => e.isIntersecting && e.target.isConnected && viewVars.world.contains(e.target),
          );
          if (!entry) return;
          // (the observer watches the marks of more blocks: each has its body's key and its page)
          const key = (entry.target as HTMLElement).dataset.bodyMoreKey!,
            p = Number((entry.target as HTMLElement).dataset.bodyMorePage);
          if ((viewVars.bodyPages.get(key) || 0) < p && !viewVars.bodyExtraPages.get(key)?.has(p)) {
            if (!viewVars.bodyExtraPages.has(key)) viewVars.bodyExtraPages.set(key, new Set());
            viewVars.bodyExtraPages.get(key)!.add(p);
            viewRedraw.render({ force: true });
          }
        },
        { root: viewVars.workspace, rootMargin: '0px 0px 160px 0px' },
      );
    for (const more of viewVars.world.querySelectorAll('[data-body-more-key]'))
      viewVars.bodyObserver?.observe(more);
  }
  function endPan() {
    const state = viewVars.pan;
    viewVars.pan = null;
    viewVars.workspace.classList.remove('blockui-panning');
    if (state && viewVars.workspace.hasPointerCapture?.(state.id))
      try {
        viewVars.workspace.releasePointerCapture(state.id);
      } catch (_) {}
    viewCalls.rememberViewState();
  }
  function startPan(pointerId: number, x: number, y: number, left = viewVars.workspace.scrollLeft, top = viewVars.workspace.scrollTop) {
    viewVars.pan = { id: pointerId, x, y, left, top };
    try { viewVars.workspace.setPointerCapture(pointerId); } catch (_) {}
    viewVars.workspace.classList.add('blockui-panning');
  }
  // Opening the places between blocks (E-07) moves every block under an opened place. What the child points at (the
  // carried block, the chosen place, the block being moved) keeps its place on the screen: the workspace scrolls by
  // what opened above it, so a press that moves a little and lets go on the spot changes nothing (E-04).
  function keepInView(anchor: Element | null | undefined, change: () => void) {
    const before = anchor?.isConnected && anchor.getClientRects().length ? anchor.getBoundingClientRect() : null;
    if (!before) { change(); return; }
    viewVars.workspace.style.overflowAnchor = 'none';
    change();
    // (the place was measured before the change: it is there)
    const after = anchor!.getBoundingClientRect(),
      shift = after.top + after.height / 2 - (before.top + before.height / 2);
    if (Math.abs(shift) >= 0.5) {
      const need = Math.ceil(viewVars.workspace.scrollTop + shift + viewVars.workspace.clientHeight);
      if (need > viewVars.plane.offsetHeight) { viewVars.planeFloor = need; viewVars.plane.style.height = need + 'px'; }
      viewVars.workspace.scrollTop += shift;
    }
    viewVars.workspace.style.overflowAnchor = '';
  }
  const touchLike: ViewEditingCalls['touchLike'] = (type) => type === 'touch' || type === 'pen';
  // A press that moves no more than this is a press (E-09); a mouse starts carrying sooner.
  const slopOf: ViewEditingCalls['slopOf'] = (type) => (touchLike(type) ? 12 : 5);
  const dropPendingPan: ViewEditingCalls['dropPendingPan'] = () => { clearTimeout(viewVars.pendingPan?.holdTimer); viewVars.pendingPan = null; };
  function carrierOf(handle: BlockHandle) {
    let carrier: BlockHandle | null | undefined = handle;
    while (carrier && viewVars.LITERAL_KINDS.has(viewCalls.schemaOf(viewVars.index.get(carrier.dataset.blockId)?.node)?.kind))
      carrier = carrier.parentElement?.closest<BlockHandle>('[data-blockui-drag="node"]');
    return carrier && !carrier.disabled && carrier.getAttribute('aria-disabled') !== 'true' ? carrier : handle;
  }
  // The carried blocks: the block itself, or with 「ここから下を まとめて もっていく」 it and the blocks after it (E-06).
  function carriedIds(state: Pick<DragState, 'id' | 'run'>) {
    return state.id ? (state.run ? viewCalls.runIds(state.id) : [state.id]) : [];
  }
  function beginGhost(state: DragState) {
    hideDropNote();
    const source = state.schemaId
      ? state.element.querySelector<HTMLElement>('.blockui-preview')
      : state.element.closest<HTMLElement>('.blockui-node');
    if (!source) return;
    const rect = source.getBoundingClientRect(),
      scale = state.schemaId ? 1 : viewVars.zoom,
      holder = viewCalls.E('div', 'blockui-world blockui-ghost-world'),
      parts = state.run ? carriedIds(state).map(id => viewCalls.locationElement({ id })).filter(Boolean) : [source];
    viewVars.ghost = viewCalls.E('div', 'blockui-editor blockui-drag-ghost');
    viewVars.ghost.setAttribute('aria-hidden', 'true');
    viewVars.ghost.inert = true;
    viewVars.ghost.dataset.paletteTone =
      source.dataset.paletteTone ||
      state.element.closest<HTMLElement>('[data-palette-tone]')?.dataset.paletteTone ||
      'data';
    for (const part of parts) {
      // (a copy of an element is an element)
      const clone = part.cloneNode(true) as HTMLElement;
      clone.classList.remove('blockui-selected', 'blockui-current', 'blockui-dragging', 'blockui-lift');
      clone.style.width = part.offsetWidth + 'px';
      clone.style.maxWidth = 'none';
      for (const n of clone.querySelectorAll('[id]')) n.removeAttribute('id');
      for (const n of clone.querySelectorAll<HTMLDetailsElement>('.blockui-actions[open],details[open]')) n.open = false;
      // The ghost shows what the block says, also the values typed into it (a select keeps 度, not 歩).
      const from = part.querySelectorAll<HTMLSelectElement | HTMLInputElement | HTMLTextAreaElement>('select,input,textarea'), to = clone.querySelectorAll<HTMLSelectElement | HTMLInputElement | HTMLTextAreaElement>('select,input,textarea');
      from.forEach((n, i) => { if (to[i]) to[i].value = n.value; });
      holder.append(clone);
      part.classList.add('blockui-dragging');
    }
    viewVars.ghost.append(holder);
    viewVars.ghost.style.width = Math.max(...parts.map(part => part.offsetWidth)) + 'px';
    viewVars.ghost.style.transform = `scale(${scale})`;
    viewVars.doc.body.append(viewVars.ghost);
    state.grabX = Math.min(rect.width, Math.max(0, state.startX - rect.left));
    state.grabY = Math.min(rect.height, Math.max(0, state.startY - rect.top));
    state.visual = source;
    state.parts = parts;
  }
  // (a ghost drawn is held where beginGhost put the grab)
  function moveGhost(point: ScreenPoint) {
    if (!viewVars.ghost || !viewVars.drag) return;
    viewVars.ghost.style.left = point.clientX - viewVars.drag.grabX! + 'px';
    viewVars.ghost.style.top = point.clientY - viewVars.drag.grabY! + 'px';
    if (viewVars.dragReason) {
      viewVars.dragReason.style.left = Math.max(4, point.clientX - 20) + 'px';
      viewVars.dragReason.style.top = Math.max(4, point.clientY - viewVars.drag.grabY! - 32) + 'px';
    }
  }
  // Inside the workspace a sentence goes to the nearest place: before a block from its upper half, after it from its
  // lower half, after an enclosure from below its bottom line (E-04). A value goes to a value place within 40 px.
  // Right over a place of the other kind (a sentence over an empty value hole, a value over a line between sentences)
  // that place is the answer: it cannot take the block, so the carried block turns grey and says why, and letting go
  // there puts nothing in. A sentence over a value already in a block (its number or its words) is over that block,
  // so it goes before or after the block as over the block's other words.
  // (a parent is found only for a place in an input, which holds one block, or a list of them when the place has an
  // index: a number read from its element)
  function emptyValueHole(element: HTMLElement) {
    const at = viewCalls.locationFromElement(element), parent = at?.input ? viewVars.index.get(at.parentId)?.node : null,
      value = parent && ((at as InputPlace).index === undefined ? parent.inputs[(at as InputPlace).input] as BlockTree | undefined : (parent.inputs[(at as InputPlace).input] as BlockTree[] | undefined)?.[(at as InputPlace).index!]);
    return BLOCK_SCHEMA_BY_ID.get(value?.schemaId)?.kind === 'Hole';
  }
  function dragCandidate(event: ScreenPoint) {
    const bounds = viewVars.workspace.getBoundingClientRect();
    if (
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    )
      return null;
    const schema = viewVars.drag?.schemaId
        ? BLOCK_SCHEMA_BY_ID.get(viewVars.drag.schemaId)
        : viewCalls.schemaOf(viewVars.index.get(viewVars.drag?.id)?.node),
      category = schema?.category,
      carried = (viewVars.drag?.parts || []).filter(Boolean);
    const direct = viewVars.doc.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-blockui-drop]');
    if (direct && viewVars.world.contains(direct) && !carried.some(part => part.contains(direct)) &&
        (category !== 'statement' || direct.dataset.blockuiBody || emptyValueHole(direct))) return direct;
    let best: HTMLElement | null = null,
      distance = Infinity;
    const candidates =
      category === 'statement'
        ? viewVars.world.querySelectorAll<HTMLElement>('.blockui-insertion,.blockui-hole-target')
        : viewVars.world.querySelectorAll<HTMLElement>('.blockui-input-slot[data-blockui-drop]');
    for (const element of candidates) {
      if (carried.some(part => part.contains(element))) continue;
      const r = element.getBoundingClientRect();
      if (!r.width || r.bottom < bounds.top || r.top > bounds.bottom) continue;
      const dx = Math.max(r.left - event.clientX, 0, event.clientX - r.right),
        dy = Math.max(r.top - event.clientY, 0, event.clientY - r.bottom),
        d = category === 'statement' ? dy + 0.35 * dx : Math.hypot(dx, dy);
      if ((category === 'statement' || d < 40) && d < distance) {
        best = element;
        distance = d;
      }
    }
    return best;
  }
  function showDragReason(text: string) {
    if (!text) { viewVars.dragReason?.remove(); viewVars.dragReason = null; return; }
    if (!viewVars.dragReason) { viewVars.dragReason = viewCalls.E('div', 'blockui-drag-reason', null, { 'aria-hidden': 'true' }); viewVars.doc.body.append(viewVars.dragReason); }
    viewVars.dragReason.textContent = text;
  }
  // A message near where the block was let go, seen where the child is looking (E-04); the live region reads it too.
  // The next carry takes it away, so it never stays over the next drop (E2-10).
  function hideDropNote() {
    clearTimeout(viewVars.dropNoteTimer);
    viewVars.dropNote?.remove();
    viewVars.dropNote = null;
  }
  function showDropNote(text: string, x: number, y: number) {
    viewCalls.announce(text);
    hideDropNote();
    viewVars.dropNote = viewCalls.E('div', 'blockui-drop-note', text, { 'aria-hidden': 'true' });
    viewVars.doc.body.append(viewVars.dropNote);
    const w = viewVars.dropNote.offsetWidth, h = viewVars.dropNote.offsetHeight, view = viewVars.doc.documentElement;
    viewVars.dropNote.style.left = Math.max(8, Math.min(x + 12, view.clientWidth - w - 8)) + 'px';
    viewVars.dropNote.style.top = Math.max(8, Math.min(y - h - 14, view.clientHeight - h - 8)) + 'px';
    const note = viewVars.dropNote;
    viewVars.dropNoteTimer = setTimeout(() => { note.classList.add('blockui-fading'); setTimeout(() => note.remove(), 320); if (viewVars.dropNote === note) viewVars.dropNote = null; }, 2200);
  }
  // A cancelled drop: the carried block goes back where it came from.
  function returnGhost(state: DragState) {
    const flying = viewVars.ghost, target = (state.schemaId ? state.visual : state.parts?.[0] || state.visual)?.getBoundingClientRect();
    viewVars.ghost = null;
    if (!flying) return;
    if (!target?.width) { flying.remove(); return; }
    flying.classList.add('blockui-returning');
    flying.style.left = target.left + 'px';
    flying.style.top = target.top + 'px';
    setTimeout(() => flying.remove(), 260);
  }
  function cancelDrag({ animate = false }: { animate?: boolean } = {}) {
    const state = viewVars.drag;
    viewVars.drag = null;
    clearTimeout(state?.holdTimer);
    if (animate && state) returnGhost(state);
    viewVars.ghost?.remove();
    viewVars.ghost = null;
    viewVars.snapPreview?.remove();
    viewVars.snapPreview = null;
    showDragReason('');
    viewVars.palette.classList.remove('blockui-delete-zone');
    state?.visual?.classList.remove('blockui-dragging');
    if (state?.started) viewVars.suppressClickUntil = Date.now() + 350;
    if (viewVars.dragFrame !== null) viewVars.doc.defaultView.cancelAnimationFrame(viewVars.dragFrame);
    viewVars.dragFrame = null;
    if (state?.element?.hasPointerCapture?.(state.pointerId))
      try {
        state.element.releasePointerCapture(state.pointerId);
      } catch (_) {}
    // The places close again around where the block goes in, or around the carried block when it stays where it was.
    const own = state?.id && viewVars.index.get(state.id), to = state?.valid && state.location,
      // (a block beside the place is in the same body: it has its index there)
      beside = own && to && to.parentId === own.parentId && to.body === own.body && (to.index === own.index || to.index === own.index! + 1),
      anchor = state?.started && viewVars.root.classList.contains('blockui-drag-statement') ? (to && !beside ? state.target : state.parts?.[0]) : null;
    for (const n of viewVars.root.querySelectorAll('.blockui-drop-preview,.blockui-drop-invalid,.blockui-dragging,.blockui-lift'))
      n.classList.remove('blockui-drop-preview', 'blockui-drop-invalid', 'blockui-dragging', 'blockui-lift');
    keepInView(anchor, () => viewVars.root.classList.remove('blockui-drag-active', 'blockui-drag-statement'));
    if (!viewVars.root.matches('.blockui-choosing,.blockui-moving-block')) viewVars.planeFloor = 0;
    viewCalls.notifyPending();
    updateControls();
  }
  Object.assign(viewCalls, {
    actorTool,
    beginGhost,
    cancel,
    cancelDrag,
    cancelField,
    carriedIds,
    carrierOf,
    chooseDestination,
    closeBlockPopovers,
    completeMove,
    dragCandidate,
    dropPendingPan,
    endPan,
    extraDisclosure,
    fieldControl,
    fitBlocks,
    flush,
    focus,
    keepInView,
    moveGhost,
    observeMore,
    operate,
    paletteAdd,
    placeNodeToolsSoon,
    removeBlock,
    renderPalette,
    renderReplacement,
    scheduleGeometry,
    setZoom,
    showDragReason,
    showDropNote,
    slopOf,
    startPan,
    touchLike,
    unitRepair,
    updateControls,
    updateGeometry,
  } satisfies ViewEditingCalls);
}
