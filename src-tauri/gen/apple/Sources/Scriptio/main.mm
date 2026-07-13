#include "bindings/bindings.h"

#import <UIKit/UIKit.h>
#import <objc/runtime.h>

// Remove the keyboard's input accessory bar for the web view.
//
// When a web `contenteditable` is focused, iOS attaches an accessory view above
// the on-screen keyboard (the rounded QuickType / suggestions strip). Native
// writing apps like WriterDuet and Google Docs don't show it, so their keyboard
// sits flush with square corners. WKWebView renders its editable content in a
// private `WKContentView`; overriding that view's `inputAccessoryView` getter to
// return nil suppresses the bar so our editor's keyboard is flush too. The class
// is resolved at runtime by name, so no private symbol is linked against.
static id scriptioNoInputAccessoryView(id self, SEL _cmd) { return nil; }

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
}
@end

int main(int argc, char * argv[]) {
	ffi::start_app();
	return 0;
}
