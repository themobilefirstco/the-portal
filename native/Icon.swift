import AppKit
let destination=CommandLine.arguments[1]
for size in [16,32,128,256,512] {
    for scale in [1,2] {
        let pixels=size*scale
        let rep=NSBitmapImageRep(bitmapDataPlanes:nil,pixelsWide:pixels,pixelsHigh:pixels,bitsPerSample:8,samplesPerPixel:4,hasAlpha:true,isPlanar:false,colorSpaceName:.deviceRGB,bytesPerRow:0,bitsPerPixel:0)!
        NSGraphicsContext.saveGraphicsState(); NSGraphicsContext.current=NSGraphicsContext(bitmapImageRep:rep)
        let s=CGFloat(pixels)
        NSColor(calibratedRed:0.92,green:0.90,blue:0.83,alpha:1).setFill()
        NSBezierPath(roundedRect:NSRect(x:s*0.05,y:s*0.05,width:s*0.90,height:s*0.90),xRadius:s*0.20,yRadius:s*0.20).fill()
        NSColor(calibratedRed:0.66,green:0.67,blue:0.60,alpha:1).setFill()
        NSBezierPath(roundedRect:NSRect(x:s*0.18,y:s*0.25,width:s*0.64,height:s*0.57),xRadius:s*0.12,yRadius:s*0.12).fill()
        NSColor(calibratedRed:0.07,green:0.24,blue:0.20,alpha:1).setFill()
        NSBezierPath(roundedRect:NSRect(x:s*0.20,y:s*0.27,width:s*0.60,height:s*0.53),xRadius:s*0.10,yRadius:s*0.10).fill()
        NSColor(calibratedRed:0.72,green:0.85,blue:0.73,alpha:1).setStroke()
        let portal=NSBezierPath(roundedRect:NSRect(x:s*0.39,y:s*0.37,width:s*0.22,height:s*0.32),xRadius:s*0.10,yRadius:s*0.10)
        portal.lineWidth=s*0.035; portal.stroke()
        NSColor(calibratedRed:0.50,green:0.59,blue:0.49,alpha:1).setFill()
        NSBezierPath(roundedRect:NSRect(x:s*0.38,y:s*0.15,width:s*0.24,height:s*0.025),xRadius:s*0.012,yRadius:s*0.012).fill()
        NSGraphicsContext.restoreGraphicsState()
        let suffix=scale==2 ? "@2x" : ""
        try rep.representation(using:.png,properties:[:])!.write(to:URL(fileURLWithPath:destination).appendingPathComponent("icon_\(size)x\(size)\(suffix).png"))
    }
}
