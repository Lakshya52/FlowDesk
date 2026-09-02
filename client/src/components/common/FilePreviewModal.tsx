import React, { useEffect, useState, useRef } from "react";
import { X, Download, ZoomIn, ZoomOut, RotateCcw, Loader2 } from "lucide-react";
import * as XLSX from "xlsx";

interface FilePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileUrl: string;
  fileType: string;
  fileName: string;
}

const FilePreviewModal: React.FC<FilePreviewModalProps> = ({
  isOpen,
  onClose,
  fileUrl,
  fileType,
  fileName,
}) => {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  // Excel state
  const [excelData, setExcelData] = useState<{
    sheetNames: string[];
    sheets: Record<string, any[][]>;
  } | null>(null);
  const [activeSheet, setActiveSheet] = useState<string>("");
  const [excelLoading, setExcelLoading] = useState(false);
  const [excelError, setExcelError] = useState<string | null>(null);

  // Close on escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

    // Safety net: reset overflow when modal is closed
  useEffect(() => {
    if (!isOpen) {
      document.body.style.overflow = "";
    }
  }, [isOpen]);

  // Reset zoom when scale goes to 1
  useEffect(() => {
    if (scale <= 1) setPosition({ x: 0, y: 0 });
  }, [scale]);

  // Reset zoom/position when a new file is opened
  useEffect(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, [fileUrl]);

  // Fetch PDF as blob to create a same-origin URL
  useEffect(() => {
    if (!isOpen || !fileUrl) return;

    const ext = fileName.split(".").pop()?.toLowerCase() || "";
    const isPdfFile = fileType === "application/pdf" || ext === "pdf";
    if (!isPdfFile) return;

    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }

    setPdfLoading(true);
    setPdfError(null);
    setPdfBlobUrl(null);

    fetch(fileUrl)
      .then((response) => {
        if (!response.ok) throw new Error(`Server returned ${response.status}`);
        return response.blob();
      })
      .then((blob) => {
        const url = URL.createObjectURL(
          new Blob([blob], { type: "application/pdf" }),
        );
        blobUrlRef.current = url;
        setPdfBlobUrl(url);
        setPdfLoading(false);
      })
      .catch((err) => {
        console.error("PDF fetch error:", err);
        setPdfError("Failed to load PDF");
        setPdfLoading(false);
      });

    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [isOpen, fileUrl, fileType, fileName]);

  // Fetch and parse Excel files
  useEffect(() => {
    if (!isOpen || !fileUrl) return;

    const ext = fileName.split(".").pop()?.toLowerCase() || "";
    const isExcelFile =
      ["xlsx", "xls", "csv"].includes(ext) ||
      fileType ===
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      fileType === "application/vnd.ms-excel" ||
      fileType === "text/csv";
    if (!isExcelFile) return;

    setExcelLoading(true);
    setExcelError(null);
    setExcelData(null);

    fetch(fileUrl)
      .then((response) => {
        if (!response.ok) throw new Error(`Server returned ${response.status}`);
        return response.arrayBuffer();
      })
      .then((buffer) => {
        const workbook = XLSX.read(buffer, { type: "array" });
        const sheets: Record<string, any[][]> = {};

        workbook.SheetNames.forEach((name) => {
          const worksheet = workbook.Sheets[name];
          sheets[name] = XLSX.utils.sheet_to_json(worksheet, {
            header: 1,
            defval: "",
          }) as any[][];
        });

        setExcelData({ sheetNames: workbook.SheetNames, sheets });
        setActiveSheet(workbook.SheetNames[0] || "");
        setExcelLoading(false);
      })
      .catch((err) => {
        console.error("Excel fetch error:", err);
        setExcelError("Failed to load spreadsheet");
        setExcelLoading(false);
      });
  }, [isOpen, fileUrl, fileType, fileName]);

  if (!isOpen) return null;

  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  const isImage =
    fileType.startsWith("image/") ||
    ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext);
  const isVideo =
    fileType.startsWith("video/") ||
    ["mp4", "webm", "ogg", "mov"].includes(ext);
  const isPdf = fileType === "application/pdf" || ext === "pdf";
  const isExcel =
    ["xlsx", "xls", "csv"].includes(ext) ||
    fileType ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    fileType === "application/vnd.ms-excel" ||
    fileType === "text/csv";

  const headerBtnStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.1)",
    border: "none",
    color: "white",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    padding: "6px",
    borderRadius: "8px",
    transition: "background 0.2s",
  };

  const currentSheetData = excelData?.sheets[activeSheet] || [];

  const handleDownload = async () => {
    const response = await fetch(fileUrl);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `FlowDesk_${fileName}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 6000,
        backgroundColor: "rgba(0, 0, 0, 0.85)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        backdropFilter: "blur(4px)",
      }}
    >
      {/* Header controls */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "16px 24px",
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, transparent 100%)",
          zIndex: 6010,
          color: "white",
        }}
      >
        <div
          style={{
            fontSize: "1rem",
            fontWeight: 500,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            maxWidth: "70%",
          }}
        >
          {fileName}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {isImage && (
            <>
              <button
                onClick={() => setScale((prev) => Math.min(prev + 0.25, 5))}
                style={headerBtnStyle}
                title="Zoom In"
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "rgba(255,255,255,0.2)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "rgba(255,255,255,0.1)")
                }
              >
                <ZoomIn size={20} />
              </button>
              <button
                onClick={() => setScale((prev) => Math.max(prev - 0.25, 0.5))}
                style={headerBtnStyle}
                title="Zoom Out"
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "rgba(255,255,255,0.2)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "rgba(255,255,255,0.1)")
                }
              >
                <ZoomOut size={20} />
              </button>
              <button
                onClick={() => setScale(1)}
                style={headerBtnStyle}
                title="Reset Zoom"
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "rgba(255,255,255,0.2)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "rgba(255,255,255,0.1)")
                }
              >
                <RotateCcw size={20} />
              </button>
            </>
          )}
          {/* <a href={fileUrl} download={fileName} style={{ ...headerBtnStyle, textDecoration: 'none' }} title="Download"
                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}>
                        <Download size={20} />
                    </a> */}
          <button
            onClick={handleDownload}
            style={headerBtnStyle}
            title="Download"
          >
            <Download size={20} />
          </button>
          <button
            onClick={onClose}
            style={{ ...headerBtnStyle, background: "rgba(255,0,0,0.6)" }}
            title="Close (Esc)"
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = "rgba(255,0,0,0.8)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = "rgba(255,0,0,0.6)")
            }
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Clickable backdrop to close */}
      <div
        style={{ position: "absolute", inset: 0, zIndex: 5990 }}
        onClick={onClose}
      />

      {/* Content Container */}
      <div
        style={{
          maxWidth: "90%",
          maxHeight: "85%",
          width: "100%",
          height: "100%",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          zIndex: 6000,
          overflow: "hidden",
        }}
        onWheel={(e) => {
          if (!isImage) return;
          const zoomSensitivity = 0.05;
          const delta = e.deltaY < 0 ? zoomSensitivity : -zoomSensitivity;
          setScale((prev) => Math.min(Math.max(0.5, prev + delta), 5));
        }}
        onMouseDown={(e) => {
          if (!isImage || scale <= 1) return;
          e.preventDefault();
          setIsDragging(true);
          setDragStart({
            x: e.clientX - position.x,
            y: e.clientY - position.y,
          });
        }}
        onMouseMove={(e) => {
          if (!isDragging) return;
          setPosition({
            x: e.clientX - dragStart.x,
            y: e.clientY - dragStart.y,
          });
        }}
        onMouseUp={() => setIsDragging(false)}
        onMouseLeave={() => setIsDragging(false)}
      >
        {isImage ? (
          <img
            src={fileUrl}
            alt={fileName}
            style={{
              maxWidth: "100%",
              maxHeight: "100%",
              objectFit: "contain",
              borderRadius: "8px",
              boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
              transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
              transition: isDragging ? "none" : "transform 0.2s ease",
              cursor:
                scale > 1 ? (isDragging ? "grabbing" : "grab") : "default",
            }}
            onClick={(e) => e.stopPropagation()}
            draggable={false}
          />
        ) : isVideo ? (
          <video
            controls
            autoPlay
            src={fileUrl}
            style={{
              maxWidth: "100%",
              maxHeight: "100%",
              borderRadius: "8px",
              boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : isPdf ? (
          <div
            style={{ width: "90vw", height: "85vh", position: "relative" }}
            onClick={(e) => e.stopPropagation()}
          >
            {pdfLoading && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "100%",
                  color: "white",
                  gap: 16,
                }}
              >
                <Loader2
                  size={40}
                  style={{ animation: "spin 1s linear infinite" }}
                />
                <p style={{ fontSize: "1rem", opacity: 0.8 }}>Loading PDF...</p>
                <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
              </div>
            )}
            {pdfError && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "100%",
                  color: "white",
                  gap: 16,
                }}
              >
                <p style={{ fontSize: "1rem", color: "#f87171" }}>{pdfError}</p>
              </div>
            )}
            {pdfBlobUrl && (
              <iframe
                src={pdfBlobUrl}
                style={{
                  width: "100%",
                  height: "100%",
                  border: "none",
                  borderRadius: "8px",
                  background: "white",
                }}
                title={fileName}
              />
            )}
          </div>
        ) : isExcel ? (
          <div
            style={{
              width: "90vw",
              height: "85vh",
              position: "relative",
              display: "flex",
              flexDirection: "column",
              background: "#1e1e2e",
              borderRadius: "12px",
              overflow: "hidden",
              boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {excelLoading && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "100%",
                  color: "white",
                  gap: 16,
                }}
              >
                <Loader2
                  size={40}
                  style={{ animation: "spin 1s linear infinite" }}
                />
                <p style={{ fontSize: "1rem", opacity: 0.8 }}>
                  Loading spreadsheet...
                </p>
                <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
              </div>
            )}
            {excelError && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "100%",
                  color: "white",
                  gap: 16,
                }}
              >
                <p style={{ fontSize: "1rem", color: "#f87171" }}>
                  {excelError}
                </p>
              </div>
            )}
            {excelData && (
              <>
                {/* Sheet tabs */}
                {excelData.sheetNames.length > 1 && (
                  <div
                    style={{
                      display: "flex",
                      gap: 0,
                      borderBottom: "2px solid #2d2d3f",
                      background: "#16161e",
                      overflowX: "auto",
                      flexShrink: 0,
                    }}
                  >
                    {excelData.sheetNames.map((name) => (
                      <button
                        key={name}
                        onClick={() => setActiveSheet(name)}
                        style={{
                          padding: "10px 20px",
                          border: "none",
                          background:
                            activeSheet === name ? "#2d2d3f" : "transparent",
                          color: activeSheet === name ? "#60a5fa" : "#a0a0b0",
                          cursor: "pointer",
                          fontSize: "0.8125rem",
                          fontWeight: activeSheet === name ? 600 : 400,
                          borderBottom:
                            activeSheet === name
                              ? "2px solid #60a5fa"
                              : "2px solid transparent",
                          transition: "all 0.2s",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                )}
                {/* Table content */}
                <div style={{ flex: 1, overflow: "auto" }}>
                  <table
                    style={{
                      borderCollapse: "collapse",
                      width: "100%",
                      fontSize: "0.8125rem",
                    }}
                  >
                    <thead>
                      {currentSheetData.length > 0 && (
                        <tr>
                          <th
                            style={{
                              position: "sticky",
                              top: 0,
                              zIndex: 10,
                              padding: "8px 6px",
                              background: "#2d2d3f",
                              color: "#60a5fa",
                              borderRight: "1px solid #3d3d4f",
                              borderBottom: "2px solid #3d3d4f",
                              textAlign: "center",
                              fontWeight: 600,
                              fontSize: "0.6875rem",
                              minWidth: 40,
                            }}
                          >
                            #
                          </th>
                          {currentSheetData[0].map((_: any, colIdx: number) => (
                            <th
                              key={colIdx}
                              style={{
                                position: "sticky",
                                top: 0,
                                zIndex: 10,
                                padding: "8px 12px",
                                background: "#2d2d3f",
                                color: "#e0e0e8",
                                borderRight: "1px solid #3d3d4f",
                                borderBottom: "2px solid #3d3d4f",
                                textAlign: "left",
                                fontWeight: 600,
                                whiteSpace: "nowrap",
                                minWidth: 80,
                              }}
                            >
                              {String(currentSheetData[0][colIdx] ?? "")}
                            </th>
                          ))}
                        </tr>
                      )}
                    </thead>
                    <tbody>
                      {currentSheetData.slice(1).map((row, rowIdx) => (
                        <tr
                          key={rowIdx}
                          style={{
                            background:
                              rowIdx % 2 === 0 ? "#1e1e2e" : "#242436",
                          }}
                        >
                          <td
                            style={{
                              padding: "6px",
                              color: "#60a5fa",
                              textAlign: "center",
                              borderRight: "1px solid #3d3d4f",
                              borderBottom: "1px solid #2d2d3f",
                              fontSize: "0.6875rem",
                              fontWeight: 500,
                            }}
                          >
                            {rowIdx + 1}
                          </td>
                          {row.map((cell: any, colIdx: number) => (
                            <td
                              key={colIdx}
                              style={{
                                padding: "6px 12px",
                                color: "#d0d0d8",
                                borderRight: "1px solid #3d3d4f",
                                borderBottom: "1px solid #2d2d3f",
                                whiteSpace: "nowrap",
                                maxWidth: 300,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {String(cell ?? "")}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {currentSheetData.length <= 1 && (
                    <div
                      style={{
                        padding: 40,
                        textAlign: "center",
                        color: "#a0a0b0",
                      }}
                    >
                      This sheet is empty.
                    </div>
                  )}
                </div>
                {/* Footer info */}
                <div
                  style={{
                    padding: "8px 16px",
                    background: "#16161e",
                    borderTop: "1px solid #2d2d3f",
                    color: "#a0a0b0",
                    fontSize: "0.75rem",
                    flexShrink: 0,
                  }}
                >
                  {currentSheetData.length > 1
                    ? currentSheetData.length - 1
                    : 0}{" "}
                  rows · {currentSheetData[0]?.length || 0} columns · Sheet:{" "}
                  {activeSheet}
                </div>
              </>
            )}
          </div>
        ) : (
          <div
            style={{
              color: "white",
              textAlign: "center",
              background: "rgba(255,255,255,0.1)",
              padding: "40px",
              borderRadius: "16px",
              backdropFilter: "blur(10px)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: "3rem", marginBottom: "16px" }}>📄</div>
            <h3 style={{ margin: "0 0 8px 0", fontWeight: 600 }}>{fileName}</h3>
            <p
              style={{
                margin: "0 0 24px 0",
                opacity: 0.7,
                fontSize: "0.875rem",
              }}
            >
              Preview not available for this file type.
            </p>
            {/* <a
              href={fileUrl}
              download={fileName}
              className="btn btn-primary"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                textDecoration: "none",
              }}
            >
              <Download size={16} /> Download File
            </a> */}
            <button
              onClick={handleDownload}
              className="btn btn-primary"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                border: "none",
                cursor: "pointer",
              }}
            >
              <Download size={16} /> Download File
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default FilePreviewModal;
