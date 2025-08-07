using Microsoft.AspNetCore.Mvc;
using System.IO;

public class DiagramController : Controller
{
    private readonly string _pdfPath = Path.Combine(Directory.GetCurrentDirectory(), "static", "pdfs");

    [HttpGet]
    public IActionResult Index()
    {
        return View("~/Views/Partials/diagram.html");
    }

    [HttpGet("pdf/{filename}")]
    public IActionResult GetPDF(string filename)
    {
        var filePath = Path.Combine(_pdfPath, filename);
        
        if (!System.IO.File.Exists(filePath))
        {
            return NotFound();
        }

        return PhysicalFile(filePath, "application/pdf");
    }
}
