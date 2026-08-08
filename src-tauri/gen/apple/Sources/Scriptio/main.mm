#include "bindings/bindings.h"

#import <UIKit/UIKit.h>
#import <objc/runtime.h>

// Remove the keyboard's input accessory bar, and the hardware-keyboard shortcuts
// bar with it, for the web view.
//
// When a web `contenteditable` is focused, iOS attaches an accessory view above
// the on-screen keyboard (the rounded QuickType / suggestions strip). Native
// writing apps like WriterDuet and Google Docs don't show it, so their keyboard
// sits flush with square corners. WKWebView renders its editable content in a
// private `WKContentView`; overriding that view's `inputAccessoryView` getter to
// return nil suppresses the bar so our editor's keyboard is flush too. The class
// is resolved at runtime by name, so no private symbol is linked against.
//
// The editor supplies its own replacements for everything these bars offered —
// undo/redo, formatting, the element picker — in [EditorBottomBar], which is why
// none of this is a loss. Note the system's undo could never have driven this
// editor's history anyway: it is a Yjs UndoManager, not WebKit's undo stack.
static id scriptioNoInputAccessoryView(id self, SEL _cmd) { return nil; }

// Emptying the accessory view alone is only half the job on iPad.
//
// The shortcuts bar iOS shows when a *hardware* keyboard is attached is not the
// accessory view but the assistant item hosted in the same place, so nil-ing the
// former leaves the latter drawn but unreachable: it has no accessory view to be
// hosted in, so its buttons — the globe, the dismiss-keyboard chevron — swallow
// taps and do nothing. iOS also goes on reserving the strip for it, which is the
// ~173px of "covered" viewport that has nothing visible in it (measured on an
// iPad Pro 12.9"; see KEYBOARD_MIN_HEIGHT, which exists to ignore that residue).
//
// So clear the assistant item's button groups too. The original implementation
// still supplies the item — UIKit hands out one instance per responder and
// expects to keep seeing it — and only its contents are emptied.
static IMP scriptioAssistantItemOriginal = NULL;

static id scriptioEmptyInputAssistantItem(id self, SEL _cmd) {
	if (!scriptioAssistantItemOriginal) return nil;
	UITextInputAssistantItem *item =
		((UITextInputAssistantItem *(*)(id, SEL))scriptioAssistantItemOriginal)(self, _cmd);
	item.leadingBarButtonGroups = @[];
	item.trailingBarButtonGroups = @[];
	return item;
}

@interface ScriptioKeyboardPatch : NSObject
@end

@implementation ScriptioKeyboardPatch
+ (void)load {
	Class cls = NSClassFromString(@"WKContentView");
	if (!cls) return;

	SEL sel = @selector(inputAccessoryView);
	Method existing = class_getInstanceMethod(cls, sel);
	const char *types = existing ? method_getTypeEncoding(existing) : "@@:";
	// class_replaceMethod adds the override to WKContentView when the method is
	// only inherited, or replaces it when the class already defines it.
	class_replaceMethod(cls, sel, (IMP)scriptioNoInputAccessoryView, types);

	// Captured *before* replacing, so the override calls the real implementation
	// rather than itself. Inherited from UIResponder, hence the capture rather
	// than a super-call.
	SEL assistantSel = @selector(inputAssistantItem);
	Method assistant = class_getInstanceMethod(cls, assistantSel);
	if (assistant) {
		scriptioAssistantItemOriginal = method_getImplementation(assistant);
		class_replaceMethod(cls, assistantSel, (IMP)scriptioEmptyInputAssistantItem,
		                    method_getTypeEncoding(assistant));
	}
}
@end

int main(int argc, char * argv[]) {
	ffi::start_app();
	return 0;
}
